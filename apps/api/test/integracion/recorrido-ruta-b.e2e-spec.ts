import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarPagos, llevarAEstado, sembrarEsquela } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { JPG_PRUEBA } from '../apoyo/identidad-prueba';
import { limpiar006, procesarTodo } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// Historia 2 de la 006: recorrido de la ruta B (ITSE previa). Datos FICTICIOS.

const hoyLima = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

describe('Recorrido de la ruta B (historia 2 de la 006)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let caja: ClienteConSesion;
  let jefatura: ClienteConSesion;
  let inspector: ClienteConSesion;

  const estadoDe = async (numero: string) =>
    (await prisma.expediente.findUniqueOrThrow({ where: { numero } })).estado;

  /** Pagado en caja: PENDIENTE_PAGO → PAGADO → EN_INSPECCION con una inspección PREVIA asignada. */
  const pagadoYAsignado = async () => {
    const { numero } = await sembrarExpediente(prisma, protector, { codigoReceta: 'LIC-03' });
    await llevarAEstado(prisma, numero, 'PENDIENTE_PAGO', { ruta: 'B' });
    const codigo = await sembrarEsquela(prisma, numero, '305.90');
    await caja
      .pedir('post', `/esquelas/${codigo}/pago`, { numeroRecibo: `REC-${numero.slice(-6)}` })
      .expect(201);
    await procesarTodo(app);
    const inspeccion = await prisma.inspeccion.findFirstOrThrow({
      where: { numero_expediente: numero },
    });
    await jefatura
      .pedir('post', `/inspecciones/${inspeccion.id}/asignar`, {
        inspectorId: inspector.usuario.id,
        programadaPara: hoyLima(),
      })
      .expect(200);
    return { numero, inspeccion };
  };

  const registrar = (id: string, campos: Record<string, string>) => {
    let pedido = request(app.getHttpServer())
      .post(`/api/v1/inspecciones/${id}/resultado`)
      .set('Authorization', `Bearer ${inspector.token}`);
    for (const [campo, valor] of Object.entries(campos)) {
      pedido = pedido.field(campo, valor);
    }
    return pedido.attach('fotos', JPG_PRUEBA, 'frente.jpg');
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    caja = await clienteConRoles(app, prisma, redis, ['CAJA']);
    jefatura = await clienteConRoles(app, prisma, redis, ['JEFATURA']);
    inspector = await clienteConRoles(app, prisma, redis, ['INSPECTOR']);
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

  it('pago → EN_INSPECCION → favorable → licencia con certificado → FINALIZADO', async () => {
    const { numero, inspeccion } = await pagadoYAsignado();
    expect(inspeccion.tipo).toBe('PREVIA');

    await registrar(inspeccion.id, {
      resultado: 'FAVORABLE',
      numeroCertificado: 'ITSE-B-0001',
      certificadoEmitidoEn: hoyLima(),
    }).expect(201);
    await procesarTodo(app);

    expect(await estadoDe(numero)).toBe('FINALIZADO');
    const licencia = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: numero },
      include: { certificado_itse: true },
    });
    expect(licencia.tipo).toBe('DEFINITIVA');
    expect(licencia.certificado_itse).toEqual([expect.objectContaining({ numero: 'ITSE-B-0001' })]);
    const historial = await prisma.historial_estado.findMany({
      where: { expediente: { numero } },
      orderBy: { ocurrido_en: 'asc' },
    });
    expect(historial.slice(-4).map((h) => h.estado_nuevo)).toEqual([
      'PAGADO',
      'EN_INSPECCION',
      'LICENCIA_EMITIDA',
      'FINALIZADO',
    ]);
  });

  it('desfavorable → DENEGADO con las observaciones como motivo y sin licencia', async () => {
    const { numero, inspeccion } = await pagadoYAsignado();

    await registrar(inspeccion.id, {
      resultado: 'DESFAVORABLE',
      observaciones: 'El local no tiene salidas de emergencia señalizadas',
    }).expect(201);
    await procesarTodo(app);

    expect(await estadoDe(numero)).toBe('DENEGADO');
    const ultimo = await prisma.historial_estado.findFirstOrThrow({
      where: { expediente: { numero } },
      orderBy: { ocurrido_en: 'desc' },
    });
    expect(ultimo).toMatchObject({
      estado_nuevo: 'DENEGADO',
      usuario_id: null,
      comentario: 'El local no tiene salidas de emergencia señalizadas',
    });
    expect(await prisma.licencia.count({ where: { numero_expediente: numero } })).toBe(0);
  });
});
