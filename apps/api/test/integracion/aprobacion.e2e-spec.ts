import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { type EstadoDePrueba, llevarAEstado } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 5 de la 005: aprobar un expediente PAGADO de ruta A o C. Datos FICTICIOS.

describe('Aprobación del expediente pagado (historia 5 de la 005)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let evaluador: ClienteConSesion;
  let jefatura: ClienteConSesion;

  const enEstado = async (estado: EstadoDePrueba, ruta: 'A' | 'B' | 'C' = 'A') => {
    const { numero } = await sembrarExpediente(prisma, protector);
    const version = await llevarAEstado(prisma, numero, estado, { ruta });
    return { numero, version };
  };

  const aprobar = (cliente: ClienteConSesion, numero: string, version: number, cuerpo = {}) =>
    cliente
      .pedir('post', `/expedientes/${numero}/aprobar`, cuerpo)
      .set('If-Match', String(version));

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
    jefatura = await clienteConRoles(app, prisma, redis, ['JEFATURA']);
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

  it.each(['A', 'C'] as const)(
    'PAGADO de ruta %s → APROBADO con historial, auditoría y evento',
    async (ruta) => {
      const { numero, version } = await enEstado('PAGADO', ruta);

      const respuesta = await aprobar(evaluador, numero, version, { comentario: 'Todo conforme' });

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['cache-control']).toBe('no-store');
      await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/aprobar', respuesta);
      expect(respuesta.body).toMatchObject({ numero, estado: 'APROBADO' });
      const historial = await prisma.historial_estado.findMany({
        where: { expediente: { numero } },
        orderBy: { ocurrido_en: 'asc' },
      });
      expect(historial.at(-1)).toMatchObject({
        estado_anterior: 'PAGADO',
        estado_nuevo: 'APROBADO',
        usuario_id: evaluador.usuario.id,
        comentario: 'Todo conforme',
      });
      expect(
        await prisma.auditoriaTramites.findFirst({ where: { numero_expediente: numero } }),
      ).toMatchObject({ accion: 'APROBAR', usuario_id: evaluador.usuario.id });
      expect(
        await prisma.evento_pendiente.count({ where: { tipo: 'EstadoExpedienteCambiado' } }),
      ).toBe(1);
    },
  );

  it('la ruta B responde 409', async () => {
    const { numero, version } = await enEstado('PAGADO', 'B');

    const respuesta = await aprobar(evaluador, numero, version);

    expect(respuesta.status).toBe(409);
    await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/aprobar', respuesta);
  });

  it('un expediente que no está PAGADO responde 409 con su estado', async () => {
    const { numero, version } = await enEstado('PENDIENTE_PAGO');

    const respuesta = await aprobar(evaluador, numero, version);

    expect(respuesta.status).toBe(409);
    expect((respuesta.body as { title: string }).title).toContain('PENDIENTE_PAGO');
  });

  it('una versión vieja responde 412 y sin If-Match 422', async () => {
    const { numero, version } = await enEstado('PAGADO');

    expect((await aprobar(evaluador, numero, version - 1)).status).toBe(412);
    expect((await evaluador.pedir('post', `/expedientes/${numero}/aprobar`, {})).status).toBe(422);
  });

  it('otro rol responde 403', async () => {
    const { numero, version } = await enEstado('PAGADO');

    expect((await aprobar(jefatura, numero, version)).status).toBe(403);
  });
});
