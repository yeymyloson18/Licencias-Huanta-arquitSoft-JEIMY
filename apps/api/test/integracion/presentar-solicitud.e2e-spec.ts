import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { clienteConRoles } from '../apoyo/admin-prueba';
import { fotografiarRecetas, restaurarRecetas, type FotoRecetas } from '../apoyo/catalogo-prueba';
import { limpiarTramites } from '../apoyo/expedientes-prueba';
import {
  confirmarIdentidad,
  REPRESENTANTE_PRUEBA,
  subirPdf,
  TITULAR_PRUEBA_1,
} from '../apoyo/identidad-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// CU04 de la 004 en línea (FR-008 a FR-022, contracts/identidad-y-solicitud.md). Datos FICTICIOS.

interface Requisito {
  id: number;
  condicion: string;
}

describe('Presentar la solicitud en línea (CU04 de la 004)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let foto: FotoRecetas;
  let requisitos: Requisito[];

  const presentar = (token: string, cuerpo: object, clave: string = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1/expedientes')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', clave)
      .send(cuerpo);

  const requisitosSiempre = () => requisitos.filter((r) => r.condicion === 'SIEMPRE');

  /** Cuerpo válido de LIC-02 con un documento por cada requisito obligatorio sin representante. */
  const cuerpoValido = async (token: string, identidad: object = TITULAR_PRUEBA_1) => ({
    codigoReceta: 'LIC-02',
    identidad,
    nombreTitular: 'Titular de Prueba Uno',
    correo: 'titular.prueba@ejemplo.pe',
    giro: 'Bodega y abarrotes',
    direccion: 'Jr. Ficticio 123, Huanta',
    zona: 'Centro',
    areaM2: 40,
    documentos: await Promise.all(
      requisitosSiempre().map(async (requisito) => ({
        requisitoId: requisito.id,
        documentoId: await subirPdf(app, token),
      })),
    ),
  });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    foto = await fotografiarRecetas(prisma, ['LIC-02']);
    const ficha = await request(app.getHttpServer()).get('/api/v1/catalogo/recetas/LIC-02');
    requisitos = (ficha.body as { requisitos: Requisito[] }).requisitos;
  });

  beforeEach(async () => {
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await restaurarRecetas(prisma, redis, foto);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('crea el expediente REGISTRADO con número, ruta A, receta al presentar, historial, auditoría y evento', async () => {
    const { token } = await confirmarIdentidad(app, redis);
    const cuerpo = await cuerpoValido(token);

    const respuesta = await presentar(token, cuerpo);

    expect(respuesta.status).toBe(201);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('post', '/expedientes', respuesta);
    const registrado = respuesta.body as { numero: string };
    expect(respuesta.body).toMatchObject({
      estado: 'REGISTRADO',
      ruta: 'A',
      codigoReceta: 'LIC-02',
      canal: 'EN_LINEA',
      vencePlazoEn: null,
    });
    expect(registrado.numero).toMatch(/^EXP-[0-9]{4}-[0-9]{6}$/);
    expect(respuesta.headers.location).toBe(`/api/v1/expedientes/${registrado.numero}`);
    expect(JSON.stringify(respuesta.body)).not.toMatch(/40000001|10400000011|987000001|Ficticio/);

    const expediente = await prisma.expediente.findUniqueOrThrow({
      where: { numero: registrado.numero },
      include: { historial_estado: true, documento: true },
    });
    expect(expediente.receta_al_presentar).toMatchObject({ codigo: 'LIC-02', tasa: '177.10' });
    expect(expediente.vence_plazo_en).toBeNull();
    expect(protector.descifrar(expediente.documento_cifrado)).toBe('40000001');
    expect(Buffer.from(expediente.direccion_cifrada).toString('utf8')).not.toContain('Ficticio');
    expect(expediente.historial_estado.map((r) => r.estado_nuevo)).toEqual(['REGISTRADO']);
    expect(expediente.documento).toHaveLength(requisitosSiempre().length);
    expect(await prisma.documento_temporal.count()).toBe(0);
    expect(
      await prisma.auditoriaTramites.findMany({ where: { numero_expediente: registrado.numero } }),
    ).toEqual([expect.objectContaining({ accion: 'PRESENTAR_EN_LINEA', usuario_id: null })]);
    const evento = await prisma.evento_pendiente.findFirstOrThrow({
      where: { tipo: 'SolicitudPresentada' },
    });
    expect(evento.datos).toEqual({
      numeroExpediente: registrado.numero,
      codigoReceta: 'LIC-02',
      ruta: 'A',
      canal: 'EN_LINEA',
    });
    expect(await prisma.esquela.count()).toBe(0);
  });

  it('sin un requisito obligatorio responde 422 por requisito y no crea nada', async () => {
    const { token } = await confirmarIdentidad(app, redis);
    const cuerpo = await cuerpoValido(token);
    const [primero, ...resto] = cuerpo.documentos;

    const respuesta = await presentar(token, { ...cuerpo, documentos: resto });

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('post', '/expedientes', respuesta);
    expect((respuesta.body as { errores: { campo: string }[] }).errores).toEqual([
      expect.objectContaining({ campo: `documentos.requisito.${String(primero?.requisitoId)}` }),
    ]);
    expect(await prisma.expediente.count()).toBe(0);
  });

  it('con representante, la carta poder es obligatoria', async () => {
    const identidad = { ...TITULAR_PRUEBA_1, representante: REPRESENTANTE_PRUEBA };
    const { token } = await confirmarIdentidad(app, redis, identidad);
    const cuerpo = await cuerpoValido(token, identidad);
    const cartaPoder = requisitos.find((r) => r.condicion === 'CON_REPRESENTANTE');

    const sinCarta = await presentar(token, cuerpo);
    expect(sinCarta.status).toBe(422);
    expect(JSON.stringify(sinCarta.body)).toContain(
      `documentos.requisito.${String(cartaPoder?.id)}`,
    );

    const conCarta = await presentar(token, {
      ...cuerpo,
      documentos: [
        ...cuerpo.documentos,
        { requisitoId: cartaPoder?.id, documentoId: await subirPdf(app, token) },
      ],
    });
    expect(conCarta.status).toBe(201);
    const fila = await prisma.expediente.findFirstOrThrow();
    expect(fila.con_representante).toBe(true);
  });

  it('una identidad distinta de la confirmada responde 403', async () => {
    const { token } = await confirmarIdentidad(app, redis);
    const cuerpo = await cuerpoValido(token, { ...TITULAR_PRUEBA_1, celular: '987000009' });

    const respuesta = await presentar(token, cuerpo);

    expect(respuesta.status).toBe(403);
    await esperarCumpleContrato('post', '/expedientes', respuesta);
  });

  it('el mismo permiso con otra clave responde 409 (aclaración 2)', async () => {
    const { token } = await confirmarIdentidad(app, redis);
    await presentar(token, await cuerpoValido(token)).expect(201);

    const respuesta = await presentar(token, await cuerpoValido(token));

    expect(respuesta.status).toBe(409);
    await esperarCumpleContrato('post', '/expedientes', respuesta);
    expect(await prisma.expediente.count()).toBe(1);
  });

  it('la misma clave y el mismo cuerpo responde 200 con el mismo número', async () => {
    const { token } = await confirmarIdentidad(app, redis);
    const cuerpo = await cuerpoValido(token);
    const clave = randomUUID();
    const primera = await presentar(token, cuerpo, clave).expect(201);

    const segunda = await presentar(token, cuerpo, clave);

    expect(segunda.status).toBe(200);
    await esperarCumpleContrato('post', '/expedientes', segunda);
    expect((segunda.body as { numero: string }).numero).toBe(
      (primera.body as { numero: string }).numero,
    );
  });

  it('sin Idempotency-Key responde 422', async () => {
    const { token } = await confirmarIdentidad(app, redis);

    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/expedientes')
      .set('Authorization', `Bearer ${token}`)
      .send(await cuerpoValido(token));

    expect(respuesta.status).toBe(422);
    expect(JSON.stringify(respuesta.body)).toContain('Idempotency-Key');
  });

  it('sin token responde 401; con la sesión de un rol que no es MESA_PARTES, 403', async () => {
    const sinToken = await request(app.getHttpServer())
      .post('/api/v1/expedientes')
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(sinToken.status).toBe(401);
    await esperarCumpleContrato('post', '/expedientes', sinToken);

    const caja = await clienteConRoles(app, prisma, redis, ['CAJA']);
    const conPersonal = await caja
      .pedir('post', '/expedientes', {})
      .set('Idempotency-Key', randomUUID());
    expect(conPersonal.status).toBe(403);
  });

  it.each([
    ['un trámite conectado', { codigoReceta: 'TRF-01' }, 'codigoReceta'],
    ['un expediente de origen', { expedienteOrigen: 'EXP-2026-000009' }, 'expedienteOrigen'],
    ['un campo que no existe', { nombre: 'X' }, 'nombre'],
  ])('rechaza %s con 422', async (_, cambio, campo) => {
    const { token } = await confirmarIdentidad(app, redis);

    const respuesta = await presentar(token, { ...(await cuerpoValido(token)), ...cambio });

    expect(respuesta.status).toBe(422);
    expect(JSON.stringify(respuesta.body)).toContain(campo);
  });

  it('un documento subido con otra verificación no sirve', async () => {
    const otro = await confirmarIdentidad(app, redis);
    const ajeno = await subirPdf(app, otro.token);
    await limpiarClavesSeguridad(redis);
    const { token } = await confirmarIdentidad(app, redis);
    const cuerpo = await cuerpoValido(token);
    const [primero, ...resto] = cuerpo.documentos;

    const respuesta = await presentar(token, {
      ...cuerpo,
      documentos: [{ requisitoId: primero?.requisitoId, documentoId: ajeno }, ...resto],
    });

    expect(respuesta.status).toBe(422);
  });

  it('si la receta cambia mientras se llena el formulario, se pide el requisito nuevo', async () => {
    const { token } = await confirmarIdentidad(app, redis);
    const cuerpo = await cuerpoValido(token);
    const admin = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
    const actuales = (
      (await admin.pedir('get', '/admin/catalogo/recetas/LIC-02')).body as {
        requisitos: { id: number; descripcion: string; obligatorio: boolean; condicion: string }[];
      }
    ).requisitos.map(({ id, descripcion, obligatorio, condicion }) => ({
      id,
      descripcion,
      obligatorio,
      condicion,
    }));
    await admin
      .pedir('put', '/catalogo/recetas/LIC-02', {
        requisitos: [
          ...actuales,
          { descripcion: 'Requisito nuevo del TUPA', condicion: 'SIEMPRE' },
        ],
      })
      .expect(200);

    const conCambio = await presentar(token, cuerpo);
    expect(conCambio.status).toBe(422);

    await restaurarRecetas(prisma, redis, foto);
    const ficha = await request(app.getHttpServer()).get('/api/v1/catalogo/recetas/LIC-02');
    requisitos = (ficha.body as { requisitos: Requisito[] }).requisitos;
    const nuevoCuerpo = await cuerpoValido(token);
    const restaurada = await presentar(token, nuevoCuerpo);
    expect(restaurada.status).toBe(201);
    const fila = await prisma.expediente.findFirstOrThrow();
    expect((fila.receta_al_presentar as { requisitos: unknown[] }).requisitos.length).toBe(
      requisitos.length,
    );
  });

  it('si falla una escritura a mitad, no queda nada (atomicidad)', async () => {
    const { token } = await confirmarIdentidad(app, redis);
    const cuerpo = await cuerpoValido(token);
    await prisma.$executeRawUnsafe(
      'ALTER TABLE tramites.historial_estado ADD CONSTRAINT prueba_atomicidad CHECK (false) NOT VALID',
    );
    try {
      const respuesta = await presentar(token, cuerpo);
      expect(respuesta.status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE tramites.historial_estado DROP CONSTRAINT prueba_atomicidad',
      );
    }

    expect(await prisma.expediente.count()).toBe(0);
    expect(await prisma.documento.count()).toBe(0);
    expect(await prisma.documento_temporal.count()).toBe(cuerpo.documentos.length);
    expect(await prisma.auditoriaTramites.count()).toBe(0);
    expect(await prisma.clave_idempotencia.count()).toBe(0);
    expect(await prisma.evento_pendiente.count({ where: { tipo: 'SolicitudPresentada' } })).toBe(0);
  });
});
