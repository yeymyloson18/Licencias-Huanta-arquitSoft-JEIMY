import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import type { Rol } from '../../src/modulos/seguridad/dominio/rol';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarTramites } from '../apoyo/expedientes-prueba';
import {
  DNI_SERVICIO_CAIDO,
  PDF_PRUEBA,
  TITULAR_EXTRANJERO,
  TITULAR_PRUEBA_1,
} from '../apoyo/identidad-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 3 de la 004: registro presencial en mesa de partes (contracts/identidad-y-solicitud.md).
// Datos FICTICIOS (quickstart.md).

describe('Registro presencial en mesa de partes (historia 3 de la 004)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let mesa: ClienteConSesion;
  let requisitosSiempre: number[];

  const subir = (token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', PDF_PRUEBA, 'solicitud.pdf');

  const subirPdf = async (token: string) =>
    ((await subir(token).expect(201)).body as { documentoId: string }).documentoId;

  const cuerpo = async (token: string, identidad: object = TITULAR_EXTRANJERO) => ({
    codigoReceta: 'LIC-02',
    identidad,
    nombreTitular: 'Titular Extranjero de Prueba',
    giro: 'Bodega',
    direccion: 'Jr. Ficticio 456',
    zona: 'Centro',
    areaM2: 35,
    documentos: await Promise.all(
      requisitosSiempre.map(async (requisitoId) => ({
        requisitoId,
        documentoId: await subirPdf(token),
      })),
    ),
  });

  const registrar = (token: string, datos: object) =>
    request(app.getHttpServer())
      .post('/api/v1/expedientes')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send(datos);

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    await limpiarClavesSeguridad(redis);
    mesa = await clienteConRoles(app, prisma, redis, ['MESA_PARTES']);
    const ficha = await request(app.getHttpServer()).get('/api/v1/catalogo/recetas/LIC-02');
    requisitosSiempre = (
      ficha.body as { requisitos: { id: number; condicion: string }[] }
    ).requisitos
      .filter((requisito) => requisito.condicion === 'SIEMPRE')
      .map((requisito) => requisito.id);
  });

  beforeEach(async () => {
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('MESA_PARTES sube documentos y registra: canal MESA_PARTES, quién registró y auditoría', async () => {
    const respuesta = await registrar(mesa.token, await cuerpo(mesa.token));

    expect(respuesta.status).toBe(201);
    await esperarCumpleContrato('post', '/expedientes', respuesta);
    expect(respuesta.body).toMatchObject({ canal: 'MESA_PARTES', estado: 'REGISTRADO' });
    const numero = (respuesta.body as { numero: string }).numero;
    const usuario = mesa.usuario;
    const expediente = await prisma.expediente.findUniqueOrThrow({
      where: { numero },
      include: { historial_estado: true },
    });
    expect(expediente.canal).toBe('MESA_PARTES');
    expect(expediente.registrado_por).toBe(usuario.id);
    expect(expediente.verificacion_id).toBeNull();
    expect(expediente.historial_estado).toEqual([
      expect.objectContaining({
        usuario_id: usuario.id,
        comentario: 'Registrada en mesa de partes',
      }),
    ]);
    expect(
      await prisma.auditoriaTramites.findMany({ where: { numero_expediente: numero } }),
    ).toEqual([
      expect.objectContaining({ accion: 'REGISTRAR_PRESENCIAL', usuario_id: usuario.id }),
    ]);
    const subidos = await prisma.documento.findMany({ where: { expediente_id: expediente.id } });
    expect(subidos).toHaveLength(requisitosSiempre.length);
  });

  it('falta un documento obligatorio → 422 como en línea', async () => {
    const datos = await cuerpo(mesa.token);
    const [primero, ...resto] = datos.documentos;

    const respuesta = await registrar(mesa.token, { ...datos, documentos: resto });

    expect(respuesta.status).toBe(422);
    expect(JSON.stringify(respuesta.body)).toContain(
      `documentos.requisito.${String(primero?.requisitoId)}`,
    );
    expect(await prisma.expediente.count()).toBe(0);
  });

  it('una identidad que no coincide → 422 sin nombrar el dato', async () => {
    const respuesta = await registrar(
      mesa.token,
      await cuerpo(mesa.token, { ...TITULAR_PRUEBA_1, fechaEmision: '2020-01-16' }),
    );

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('post', '/expedientes', respuesta);
    expect((respuesta.body as { errores: unknown[] }).errores).toEqual([
      { campo: 'identidad', mensaje: 'Los datos no coinciden con el servicio de identificación' },
    ]);
  });

  it('si el servicio de identificación no responde → 503', async () => {
    const respuesta = await registrar(
      mesa.token,
      await cuerpo(mesa.token, { ...TITULAR_PRUEBA_1, numeroDocumento: DNI_SERVICIO_CAIDO }),
    );

    expect(respuesta.status).toBe(503);
    await esperarCumpleContrato('post', '/expedientes', respuesta);
    expect(await prisma.expediente.count()).toBe(0);
  });

  it('los documentos subidos por otro usuario de mesa de partes no sirven', async () => {
    const otro = await clienteConRoles(app, prisma, redis, ['MESA_PARTES']);
    const datos = await cuerpo(otro.token);

    const respuesta = await registrar(mesa.token, datos);

    expect(respuesta.status).toBe(422);
    expect(await prisma.expediente.count()).toBe(0);
  });

  it.each<Rol>(['CAJA', 'INSPECTOR', 'EVALUADOR', 'JEFATURA', 'ADMINISTRADOR'])(
    'con el rol %s → 403 al subir y al registrar, sin crear nada',
    async (rol) => {
      const cliente = await clienteConRoles(app, prisma, redis, [rol]);
      const antes = await prisma.documento_temporal.count();

      const subida = await subir(cliente.token);
      const registro = await registrar(cliente.token, await cuerpo(mesa.token));

      expect(subida.status).toBe(403);
      await esperarCumpleContrato('post', '/documentos', subida);
      expect(registro.status).toBe(403);
      await esperarCumpleContrato('post', '/expedientes', registro);
      expect(await prisma.expediente.count()).toBe(0);
      expect(await prisma.documento_temporal.count()).toBe(antes + requisitosSiempre.length);
    },
  );

  it('sin sesión → 401', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/expedientes')
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(respuesta.status).toBe(401);
  });
});
