import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarPagos, procesarEventos, versionDe } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// Flujo completo de la 005 (quickstart): REGISTRADO → EN_EVALUACION → PENDIENTE_PAGO → (esquela) →
// pago en caja → PAGADO → APROBADO. Datos FICTICIOS.

describe('Flujo completo de evaluación y pago (005)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let evaluador: ClienteConSesion;
  let caja: ClienteConSesion;

  const decidir = async (numero: string, accion: string) =>
    evaluador
      .pedir('post', `/expedientes/${numero}/${accion}`, {})
      .set('If-Match', String(await versionDe(prisma, numero)));

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
    caja = await clienteConRoles(app, prisma, redis, ['CAJA']);
  });

  afterAll(async () => {
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('recorre todos los estados con su historial, auditoría y eventos', async () => {
    const { numero } = await sembrarExpediente(prisma, protector);
    const historialInicial = await prisma.historial_estado.count({
      where: { expediente: { numero } },
    });

    expect((await decidir(numero, 'evaluacion')).status).toBe(200);
    const riesgo = await decidir(numero, 'riesgo');
    expect(riesgo.status).toBe(200);
    expect((riesgo.body as { estado: string }).estado).toBe('PENDIENTE_PAGO');

    // La esquela llega por la cola de eventos (EsquelaSolicitada).
    expect(await prisma.esquela.count({ where: { numero_expediente: numero } })).toBe(0);
    await procesarEventos(app);
    const esquela = await prisma.esquela.findUniqueOrThrow({
      where: { numero_expediente: numero },
    });

    await caja.pedir('get', `/esquelas/${esquela.codigo}`).expect(200);
    await caja
      .pedir('post', `/esquelas/${esquela.codigo}/pago`, { numeroRecibo: 'REC-9001' })
      .expect(201);
    await procesarEventos(app);
    expect((await prisma.expediente.findUniqueOrThrow({ where: { numero } })).estado).toBe(
      'PAGADO',
    );

    const aprobado = await decidir(numero, 'aprobar');
    expect(aprobado.status).toBe(200);
    expect((aprobado.body as { estado: string }).estado).toBe('APROBADO');

    const historial = await prisma.historial_estado.findMany({
      where: { expediente: { numero } },
      orderBy: { ocurrido_en: 'asc' },
    });
    expect(historial.slice(historialInicial).map((h) => h.estado_nuevo)).toEqual([
      'EN_EVALUACION',
      'PENDIENTE_PAGO',
      'PAGADO',
      'APROBADO',
    ]);
    expect(historialInicial + 4).toBe(historial.length);
    expect(
      (
        await prisma.auditoriaTramites.findMany({
          where: { numero_expediente: numero },
          orderBy: { ocurrido_en: 'asc' },
        })
      ).map((a) => a.accion),
    ).toEqual(['INICIAR_EVALUACION', 'CONFIRMAR_RIESGO', 'APROBAR']);
    expect(await prisma.auditoriaPagos.count({ where: { codigo_esquela: esquela.codigo } })).toBe(
      1,
    );
    const eventos = await prisma.evento_pendiente.findMany({ orderBy: { id: 'asc' } });
    expect(eventos.filter((e) => e.tipo === 'EstadoExpedienteCambiado')).toHaveLength(4);
    expect(eventos.filter((e) => e.tipo === 'EsquelaSolicitada')).toHaveLength(1);
    expect(eventos.filter((e) => e.tipo === 'PagoRegistrado')).toHaveLength(1);
    expect(
      eventos
        .filter((e) => e.tipo === 'EsquelaSolicitada' || e.tipo === 'PagoRegistrado')
        .every((e) => e.procesado_en !== null),
    ).toBe(true);
  });
});
