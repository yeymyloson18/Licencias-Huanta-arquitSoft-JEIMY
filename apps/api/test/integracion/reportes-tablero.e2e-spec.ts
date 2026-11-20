import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { CacheReportesRedis } from '../../src/modulos/reportes/infraestructura/fuentes-fachadas';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarPagos, sembrarEsquela } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { limpiar006 } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 1 de la 007: tablero de la jefatura con datos sembrados en fechas conocidas (SC-002).
// Octubre de 2026: el 5 es lunes y el 8 es feriado nacional (sembrado por la migración 0010).
// Datos FICTICIOS.

const lima = (fechaHora: string) => new Date(`${fechaHora}-05:00`);

interface TiempoPorReceta {
  codigoReceta: string;
  plazoTupaDias: number;
  atendidos: number;
  promedioDiasHabiles: number | null;
  dentroDelPlazo: number | null;
}

describe('Tablero de la jefatura (historia 1 de la 007)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let jefatura: ClienteConSesion;
  let evaluador: ClienteConSesion;

  const limpiarCache = async () => {
    for (const clave of await redis.keys('rep:*')) {
      await redis.del(clave);
    }
  };

  /** Expediente con su historial (el REGISTRADO lo crea la siembra) y estado final. */
  const expediente = async (
    codigoReceta: string,
    presentado: string,
    pasos: [string, string][],
    estado: string,
  ) => {
    const sembrado = await sembrarExpediente(prisma, protector, {
      codigoReceta,
      presentadoEn: lima(presentado),
    });
    let anterior = 'REGISTRADO';
    for (const [estadoNuevo, cuando] of pasos) {
      await prisma.historial_estado.create({
        data: {
          expediente_id: sembrado.id,
          estado_anterior: anterior,
          estado_nuevo: estadoNuevo,
          ocurrido_en: lima(cuando),
        },
      });
      anterior = estadoNuevo;
    }
    await prisma.expediente.update({ where: { numero: sembrado.numero }, data: { estado } });
    return sembrado.numero;
  };

  const pagada = async (numero: string, monto: string, cuando: string) => {
    const codigo = await sembrarEsquela(prisma, numero, monto);
    await prisma.esquela.update({
      where: { codigo },
      data: {
        numero_recibo: `REC-${numero.slice(-6)}`,
        pagada_en: lima(cuando),
        generada_en: lima('2026-09-01T08:00:00'),
        registrado_por: jefatura.usuario.id,
      },
    });
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    await limpiar006(prisma);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    jefatura = await clienteConRoles(app, prisma, redis, ['JEFATURA']);
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);

    // E1: LIC-02, del lunes 5 al viernes 9 con el pago pendiente del 6 al 8 → 6, 7 y 9 (el 8 es
    // feriado) = 3 días, menos el 7 suspendido = 2 días (dentro del plazo de 2).
    const e1 = await expediente(
      'LIC-02',
      '2026-10-05T09:00:00',
      [
        ['EN_EVALUACION', '2026-10-05T10:00:00'],
        ['PENDIENTE_PAGO', '2026-10-06T10:00:00'],
        ['PAGADO', '2026-10-08T10:00:00'],
        ['APROBADO', '2026-10-09T10:00:00'],
        ['LICENCIA_EMITIDA', '2026-10-09T10:00:01'],
      ],
      'FINALIZADO',
    );
    // E2: LIC-02, del 5 al 14 sin suspensiones → 6, 7, 9, 12, 13 y 14 = 6 días (fuera del plazo).
    const e2 = await expediente(
      'LIC-02',
      '2026-10-05T11:00:00',
      [
        ['EN_EVALUACION', '2026-10-06T10:00:00'],
        ['APROBADO', '2026-10-14T16:00:00'],
      ],
      'FINALIZADO',
    );
    // E3: LIC-03 presentado en septiembre y denegado el 2 de octubre → 29, 30, 1 y 2 = 4 días.
    await expediente(
      'LIC-03',
      '2026-09-28T09:00:00',
      [
        ['EN_EVALUACION', '2026-09-28T12:00:00'],
        ['DENEGADO', '2026-10-02T12:00:00'],
      ],
      'DENEGADO',
    );
    // E4: presentado en octubre, todavía en evaluación (cuenta en el estado, no en el promedio).
    const e4 = await expediente(
      'LIC-02',
      '2026-10-20T09:00:00',
      [['EN_EVALUACION', '2026-10-20T10:00:00']],
      'EN_EVALUACION',
    );
    // E5: todo en septiembre (fuera del rango).
    const e5 = await expediente(
      'LIC-02',
      '2026-09-14T09:00:00',
      [['APROBADO', '2026-09-18T09:00:00']],
      'FINALIZADO',
    );

    await pagada(e1, '177.10', '2026-10-08T10:00:00');
    await pagada(e2, '177.10', '2026-10-10T09:00:00');
    await pagada(e4, '0.10', '2026-10-31T23:30:00'); // último día de octubre en Lima
    await pagada(e5, '305.90', '2026-11-01T00:30:00'); // ya es noviembre en Lima
  });

  beforeEach(async () => {
    await limpiarCache();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await limpiarCache();
    await limpiar006(prisma);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('conteos, tiempos frente al plazo e ingresos exactos de octubre', async () => {
    const respuesta = await jefatura.pedir(
      'get',
      '/reportes/tablero?desde=2026-10-01&hasta=2026-10-31',
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('get', '/reportes/tablero', respuesta);
    const cuerpo = respuesta.body as {
      desde: string;
      hasta: string;
      expedientesPorEstado: Record<string, number>;
      tiempoPromedioPorReceta: TiempoPorReceta[];
      ingresos: { total: string; porReceta: Record<string, string> };
    };
    expect(cuerpo).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(cuerpo.expedientesPorEstado).toEqual({ FINALIZADO: 2, EN_EVALUACION: 1 });
    const de = (codigo: string) =>
      cuerpo.tiempoPromedioPorReceta.find((t) => t.codigoReceta === codigo);
    expect(de('LIC-02')).toEqual({
      codigoReceta: 'LIC-02',
      plazoTupaDias: 2,
      atendidos: 2,
      promedioDiasHabiles: 4,
      dentroDelPlazo: 50,
    });
    expect(de('LIC-03')).toEqual({
      codigoReceta: 'LIC-03',
      plazoTupaDias: 8,
      atendidos: 1,
      promedioDiasHabiles: 4,
      dentroDelPlazo: 100,
    });
    expect(de('LIC-01')).toMatchObject({
      atendidos: 0,
      promedioDiasHabiles: null,
      dentroDelPlazo: null,
    });
    expect(cuerpo.ingresos).toEqual({ total: '354.30', porReceta: { 'LIC-02': '354.30' } });
  });

  it('sin fechas toma el mes actual; un rango sin datos responde en cero', async () => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

    const actual = await jefatura.pedir('get', '/reportes/tablero');
    const vacio = await jefatura.pedir(
      'get',
      '/reportes/tablero?desde=2025-01-01&hasta=2025-01-31',
    );

    expect(actual.status).toBe(200);
    expect(actual.body).toMatchObject({ desde: `${hoy.slice(0, 8)}01`, hasta: hoy });
    expect(vacio.body).toMatchObject({
      expedientesPorEstado: {},
      ingresos: { total: '0.00', porReceta: {} },
    });
  });

  it.each([
    ['solo desde', '?desde=2026-10-01'],
    ['fecha inválida', '?desde=2026-02-30&hasta=2026-03-01'],
    ['desde posterior', '?desde=2026-10-31&hasta=2026-10-01'],
    ['más de 366 días', '?desde=2025-01-01&hasta=2026-10-01'],
  ])('%s → 422', async (_, consulta) => {
    const respuesta = await jefatura.pedir('get', `/reportes/tablero${consulta}`);

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('get', '/reportes/tablero', respuesta);
  });

  it('la segunda consulta usa la caché de 5 minutos', async () => {
    await jefatura.pedir('get', '/reportes/tablero?desde=2026-10-01&hasta=2026-10-31');

    expect(await redis.ttl('rep:tablero:2026-10-01:2026-10-31')).toBeGreaterThan(290);
    await redis.set(
      'rep:tablero:2026-10-01:2026-10-31',
      JSON.stringify({ desde: '2026-10-01', marca: 'desde-cache' }),
      'EX',
      300,
    );
    const segunda = await jefatura.pedir(
      'get',
      '/reportes/tablero?desde=2026-10-01&hasta=2026-10-31',
    );
    expect(segunda.body).toMatchObject({ marca: 'desde-cache' });
  });

  it('con la caché caída responde igual', async () => {
    jest.spyOn(CacheReportesRedis.prototype, 'leer').mockRejectedValue(new Error('caída'));
    jest.spyOn(CacheReportesRedis.prototype, 'guardar').mockRejectedValue(new Error('caída'));

    const respuesta = await jefatura.pedir(
      'get',
      '/reportes/tablero?desde=2026-10-01&hasta=2026-10-31',
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ ingresos: { total: '354.30' } });
    jest.restoreAllMocks();
  });

  it('otro rol → 403 y sin sesión → 401', async () => {
    expect((await evaluador.pedir('get', '/reportes/tablero')).status).toBe(403);
    const sinSesion = await jefatura.pedir('get', '/reportes/tablero').set('Authorization', '');
    expect(sinSesion.status).toBe(401);
  });
});
