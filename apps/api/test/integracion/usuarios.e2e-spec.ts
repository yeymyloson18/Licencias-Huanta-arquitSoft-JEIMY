import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { iniciarSesionDePrueba } from '../apoyo/sesion-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 5 (RF22, FR-016 a FR-022b) vista por el administrador.

const NUEVO = {
  correo: 'nueva.persona@ejemplo.pe',
  nombreCompleto: 'Nueva Persona de Caja',
  celular: '912345321',
  claveTemporal: 'ClaveTemporal2026',
  roles: ['CAJA', 'JEFATURA'],
};

interface UsuarioJson {
  id: string;
  roles: string[];
  activo: boolean;
}

describe('Gestión de usuarios (historia 5)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;
  let admin: ClienteConSesion;
  const urls: string[] = [];

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
  });

  beforeEach(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    admin = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR'], urls);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
    // Ninguna URL usada en esta suite lleva correo, nombre ni celular (principio VII).
    for (const url of urls) {
      expect(url).not.toMatch(/@|ejemplo|9\d{8}|Persona/);
    }
  });

  const crear = async (cambios: object = {}) => {
    const respuesta = await admin.pedir('post', '/usuarios', { ...NUEVO, ...cambios });
    await esperarCumpleContrato('post', '/usuarios', respuesta);
    return respuesta;
  };

  it('crea un usuario con clave temporal y el celular enmascarado (201)', async () => {
    const respuesta = await crear();

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      correo: NUEVO.correo,
      nombreCompleto: NUEVO.nombreCompleto,
      celularEnmascarado: '9*****321',
      activo: true,
      debeCambiarClave: true,
    });
    expect(JSON.stringify(respuesta.body)).not.toContain(NUEVO.celular);
    const fila = await prisma.usuario_rol.findMany({
      where: { usuario_id: (respuesta.body as UsuarioJson).id },
    });
    expect(fila.every((f) => f.asignado_por === admin.usuario.id)).toBe(true);
  });

  it('un correo repetido responde 409 correo-en-uso; un celular inválido, 422 sin el valor', async () => {
    await crear();

    const repetido = await crear({ correo: 'NUEVA.persona@ejemplo.pe' });
    expect(repetido.status).toBe(409);
    expect(repetido.body).toMatchObject({
      type: 'https://licencias.example.pe/errores/correo-en-uso',
    });

    const invalido = await crear({ correo: 'otra@ejemplo.pe', celular: '12345678' });
    expect(invalido.status).toBe(422);
    expect(JSON.stringify(invalido.body)).not.toContain('12345678');

    const clave = await crear({ correo: 'otra@ejemplo.pe', claveTemporal: 'corta' });
    expect(clave.status).toBe(422);
    expect(JSON.stringify(clave.body)).not.toContain('corta');
  });

  it('PATCH cambia nombre, celular y estado; el correo no se puede cambiar', async () => {
    const { id } = (await crear()).body as UsuarioJson;

    const cambio = await admin.pedir('patch', `/usuarios/${id}`, {
      nombreCompleto: 'Nombre Corregido',
      celular: '987000111',
      activo: false,
    });
    expect(cambio.status).toBe(200);
    await esperarCumpleContrato('patch', '/usuarios/{usuarioId}', cambio);
    expect(cambio.body).toMatchObject({
      nombreCompleto: 'Nombre Corregido',
      celularEnmascarado: '9*****111',
      activo: false,
    });

    const conCorreo = await admin.pedir('patch', `/usuarios/${id}`, { correo: 'otro@ejemplo.pe' });
    expect(conCorreo.status).toBe(422);
    await esperarCumpleContrato('patch', '/usuarios/{usuarioId}', conCorreo);

    const inexistente = await admin.pedir(
      'patch',
      '/usuarios/00000000-0000-4000-8000-000000000000',
      {
        activo: false,
      },
    );
    expect(inexistente.status).toBe(404);
  });

  it('PUT de roles conserva el historial: la asignación retirada no se borra y volver a darla crea otra', async () => {
    const { id } = (await crear()).body as UsuarioJson;

    const sinCaja = await admin.pedir('put', `/usuarios/${id}/roles`, { roles: ['JEFATURA'] });
    expect(sinCaja.status).toBe(200);
    await esperarCumpleContrato('put', '/usuarios/{usuarioId}/roles', sinCaja);
    expect((sinCaja.body as UsuarioJson).roles).toEqual(['JEFATURA']);

    await admin.pedir('put', `/usuarios/${id}/roles`, { roles: ['JEFATURA', 'CAJA'] }).expect(200);

    const filasCaja = await prisma.usuario_rol.findMany({
      where: { usuario_id: id, rol_codigo: 'CAJA' },
      orderBy: { asignado_en: 'asc' },
    });
    expect(filasCaja).toHaveLength(2);
    expect(filasCaja[0]?.retirado_por).toBe(admin.usuario.id);
    expect(filasCaja[0]?.retirado_en).not.toBeNull();
    expect(filasCaja[1]?.retirado_en).toBeNull();
  });

  it('lista con filtro de estado y busca por fragmento del nombre o por correo completo', async () => {
    const { id } = (await crear()).body as UsuarioJson;
    await crear({ correo: 'otra.persona@ejemplo.pe', nombreCompleto: 'Otra Inspectora' });
    await admin.pedir('patch', `/usuarios/${id}`, { activo: false }).expect(200);

    const inactivos = await admin.pedir('get', '/usuarios?activo=false');
    expect(inactivos.status).toBe(200);
    await esperarCumpleContrato('get', '/usuarios', inactivos);
    expect((inactivos.body as { datos: UsuarioJson[] }).datos.map((u) => u.id)).toEqual([id]);

    const porNombre = await admin.pedir('post', '/usuarios/busqueda', { texto: 'inspec' });
    expect(porNombre.status).toBe(200);
    await esperarCumpleContrato('post', '/usuarios/busqueda', porNombre);
    expect(porNombre.body).toMatchObject({
      total: 1,
      datos: [{ nombreCompleto: 'Otra Inspectora' }],
    });

    const porCorreo = await admin.pedir('post', '/usuarios/busqueda', {
      texto: 'Nueva.Persona@ejemplo.pe',
    });
    expect(porCorreo.body).toMatchObject({ total: 1, datos: [{ id }] });
  });

  it('la clave temporal invalida la anterior, cierra las sesiones y exige cambiarla al entrar', async () => {
    const persona = await clienteConRoles(app, prisma, redis, ['CAJA']);
    const sesionAbierta = await iniciarSesionDePrueba(app, redis, persona.usuario);

    const asignada = await admin.pedir('post', `/usuarios/${persona.usuario.id}/clave-temporal`, {
      claveTemporal: 'ClaveTemporalNueva2026',
    });
    expect(asignada.status).toBe(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/iniciar-sesion')
      .send({ correo: persona.usuario.correo, clave: persona.usuario.clave })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/renovar')
      .set('Cookie', sesionAbierta.cookie)
      .expect(401);

    const nueva = await iniciarSesionDePrueba(app, redis, {
      ...persona.usuario,
      clave: 'ClaveTemporalNueva2026',
    });
    expect(nueva.accessToken.length).toBeGreaterThan(0);
    const estado = await prisma.usuario.findUniqueOrThrow({ where: { id: persona.usuario.id } });
    expect(estado.debe_cambiar_clave).toBe(true);
  });
});
