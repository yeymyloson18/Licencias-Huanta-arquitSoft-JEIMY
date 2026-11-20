import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarPagos, llevarAEstado, versionDe } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { limpiar006, procesarTodo } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// Historia 1 de la 006: aprobar emite la licencia (A definitiva, C provisional). Datos FICTICIOS.

describe('Emisión de la licencia al aprobar (historia 1 de la 006)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let evaluador: ClienteConSesion;

  const pagadoYAprobado = async (
    ruta: 'A' | 'C',
    codigoReceta = ruta === 'C' ? 'LIC-09' : 'LIC-02',
  ) => {
    const { numero } = await sembrarExpediente(prisma, protector, { codigoReceta });
    await llevarAEstado(prisma, numero, 'PAGADO', { ruta });
    await evaluador
      .pedir('post', `/expedientes/${numero}/aprobar`, {})
      .set('If-Match', String(await versionDe(prisma, numero)))
      .expect(200);
    return numero;
  };

  const historialDe = (numero: string) =>
    prisma.historial_estado.findMany({
      where: { expediente: { numero } },
      orderBy: { ocurrido_en: 'asc' },
    });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
  });

  beforeEach(async () => {
    await limpiar006(prisma);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiar006(prisma);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('ruta A: licencia DEFINITIVA, LICENCIA_EMITIDA → ITSE_POSTERIOR_PENDIENTE e inspección pedida', async () => {
    const numero = await pagadoYAprobado('A');

    await procesarTodo(app);

    const licencia = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: numero },
    });
    expect(licencia).toMatchObject({ tipo: 'DEFINITIVA', estado: 'VIGENTE', vigente_hasta: null });
    expect(licencia.numero).toMatch(/^LF-2026-\d{6}$/);
    expect(licencia.codigo_verificacion).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(licencia.titular_publico).toBe('Titular D. P. U.');
    expect((await prisma.expediente.findUniqueOrThrow({ where: { numero } })).estado).toBe(
      'ITSE_POSTERIOR_PENDIENTE',
    );
    expect(
      (await historialDe(numero)).slice(-3).map((h) => [h.estado_nuevo, h.usuario_id]),
    ).toEqual([
      ['APROBADO', evaluador.usuario.id],
      ['LICENCIA_EMITIDA', null],
      ['ITSE_POSTERIOR_PENDIENTE', null],
    ]);
    expect(
      await prisma.auditoriaLicencias.findMany({ where: { numero_expediente: numero } }),
    ).toEqual([
      expect.objectContaining({
        accion: 'EMITIR',
        usuario_id: null,
        numero_licencia: licencia.numero,
      }),
    ]);
    expect(
      await prisma.evento_pendiente.findFirst({
        where: {
          tipo: 'InspeccionRequerida',
          datos: { path: ['numeroExpediente'], equals: numero },
        },
      }),
    ).toMatchObject({ datos: { numeroExpediente: numero, tipo: 'POSTERIOR' } });
  });

  it('ruta C: licencia PROVISIONAL de 12 meses, LICENCIA_PROVISIONAL e inspección BODEGA pedida', async () => {
    const numero = await pagadoYAprobado('C');

    await procesarTodo(app);

    const licencia = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: numero },
    });
    expect(licencia.tipo).toBe('PROVISIONAL');
    const emitida = licencia.emitida_en;
    const esperado = new Date(Date.UTC(emitida.getUTCFullYear() + 1, emitida.getUTCMonth(), 1));
    expect(licencia.vigente_hasta?.getUTCFullYear()).toBe(esperado.getUTCFullYear());
    expect((await prisma.expediente.findUniqueOrThrow({ where: { numero } })).estado).toBe(
      'LICENCIA_PROVISIONAL',
    );
    expect(
      await prisma.auditoriaLicencias.findFirst({ where: { numero_expediente: numero } }),
    ).toMatchObject({
      accion: 'EMITIR_PROVISIONAL',
    });
    expect(
      await prisma.evento_pendiente.findFirst({
        where: {
          tipo: 'InspeccionRequerida',
          datos: { path: ['numeroExpediente'], equals: numero },
        },
      }),
    ).toMatchObject({ datos: { tipo: 'BODEGA' } });
  });

  it('una LicenciaSolicitada repetida no emite otra licencia ni repite los cambios de estado', async () => {
    const numero = await pagadoYAprobado('A');
    await procesarTodo(app);
    const historial = (await historialDe(numero)).length;

    await prisma.evento_pendiente.create({
      data: { tipo: 'LicenciaSolicitada', datos: { numeroExpediente: numero, tipo: 'DEFINITIVA' } },
    });
    await procesarTodo(app);

    expect(await prisma.licencia.count({ where: { numero_expediente: numero } })).toBe(1);
    expect(await historialDe(numero)).toHaveLength(historial);
    expect(
      await prisma.evento_pendiente.count({
        where: { tipo: 'LicenciaEmitida', procesado_en: null },
      }),
    ).toBe(0);
  });
});
