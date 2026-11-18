import { once } from 'node:events';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { configurarAplicacion } from '../../src/configurar-aplicacion';
import { REPOSITORIO_CATALOGO } from '../../src/modulos/catalogo/catalogo.module';
import type { RepositorioCatalogo } from '../../src/modulos/catalogo/dominio/repositorio-catalogo';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Requiere PostgreSQL con las migraciones aplicadas (esquema + datos semilla) y Redis.
process.env.DATABASE_URL ??=
  'postgresql://licencias:cambiar_en_produccion_solo_desarrollo@localhost:5432/licencias';
process.env.REDIS_URL ??= 'redis://localhost:6379';

const RUTA = '/catalogo/recetas';

// Valores de docs/05-modelo-de-datos/datos-semilla.sql (solo en la prueba: FR-016 prohíbe
// escribirlos en el código del portal o del backend).
const LICENCIAS_SEMILLA = [
  { codigo: 'LIC-01', tasa: '159.50', plazoDias: 2, ruta: 'A' },
  { codigo: 'LIC-02', tasa: '177.10', plazoDias: 2, ruta: 'A' },
  { codigo: 'LIC-03', tasa: '305.90', plazoDias: 8, ruta: 'B' },
  { codigo: 'LIC-04', tasa: '538.90', plazoDias: 8, ruta: 'B' },
  { codigo: 'LIC-05', tasa: '529.20', plazoDias: 8, ruta: 'B' },
  { codigo: 'LIC-06', tasa: '180.40', plazoDias: 2, ruta: 'A' },
  { codigo: 'LIC-07', tasa: '309.20', plazoDias: 8, ruta: 'B' },
  { codigo: 'LIC-08', tasa: '542.20', plazoDias: 8, ruta: 'B' },
  { codigo: 'LIC-09', tasa: '0.00', plazoDias: 5, ruta: 'C' },
];

describe('GET /api/v1/catalogo/recetas', () => {
  let app: INestApplication;
  let redis: Redis;
  let prisma: PrismaServicio;

  const consultar = (consulta = '') =>
    request(app.getHttpServer() as Parameters<typeof request>[0]).get(`/api/v1${RUTA}${consulta}`);

  const borrarCache = async () => {
    const claves = await redis.keys('catalogo:recetas:*');
    if (claves.length > 0) {
      await redis.del(...claves);
    }
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication({ logger: false });
    configurarAplicacion(app);
    await app.init();

    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    if (redis.status !== 'ready') {
      await once(redis, 'ready');
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(borrarCache);

  it('con tipo=LICENCIA devuelve exactamente LIC-01 a LIC-09 con los datos semilla', async () => {
    const respuesta = await consultar('?tipo=LICENCIA');

    expect(respuesta.status).toBe(200);
    await esperarCumpleContrato('get', RUTA, respuesta);
    const recetas = respuesta.body as {
      codigo: string;
      tasa: string;
      plazoDias: number;
      ruta: string;
      tipo: string;
    }[];
    expect(
      recetas.map(({ codigo, tasa, plazoDias, ruta }) => ({ codigo, tasa, plazoDias, ruta })),
    ).toEqual(LICENCIAS_SEMILLA);
    expect(new Set(recetas.map((receta) => receta.tipo))).toEqual(new Set(['LICENCIA']));
  });

  it('sin filtro devuelve las 12 recetas activas (9 licencias y 3 trámites conectados)', async () => {
    const respuesta = await consultar();

    expect(respuesta.status).toBe(200);
    await esperarCumpleContrato('get', RUTA, respuesta);
    const recetas = respuesta.body as { codigo: string; ruta: string | null }[];
    expect(recetas).toHaveLength(12);
    expect(recetas.find((receta) => receta.codigo === 'TRF-01')).toMatchObject({
      ruta: null,
      plazoDias: null,
      tasa: '45.10',
    });
  });

  it('con tipo=TRAMITE_CONECTADO devuelve los 3 trámites conectados', async () => {
    const respuesta = await consultar('?tipo=TRAMITE_CONECTADO');

    expect(respuesta.status).toBe(200);
    await esperarCumpleContrato('get', RUTA, respuesta);
    expect((respuesta.body as { codigo: string }[]).map((r) => r.codigo)).toEqual([
      'CGI-01',
      'DUP-01',
      'TRF-01',
    ]);
  });

  it('indica Cache-Control: public, max-age=300', async () => {
    const respuesta = await consultar('?tipo=LICENCIA');

    expect(respuesta.headers['cache-control']).toBe('public, max-age=300');
  });

  it.each(['?tipo=OTRO', '?tipo=licencia', '?tipo=LICENCIA&tipo=TRAMITE_CONECTADO'])(
    'responde 422 problem+json para %s',
    async (consulta) => {
      const respuesta = await consultar(consulta);

      expect(respuesta.status).toBe(422);
      expect(respuesta.headers['content-type']).toMatch(/^application\/problem\+json/);
      await esperarCumpleContrato('get', RUTA, respuesta);
      expect((respuesta.body as { errores: { campo: string }[] }).errores[0]?.campo).toBe('tipo');
    },
  );

  it('guarda el resultado en Redis con un TTL de 240 s como máximo (FR-024 de la 003)', async () => {
    await consultar('?tipo=LICENCIA');

    const ttl = await redis.ttl('catalogo:recetas:LICENCIA');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(240);
  });

  it('un cambio de tasa en el catálogo se refleja sin tocar código (EQ-06)', async () => {
    try {
      await consultar('?tipo=LICENCIA');
      await prisma.receta.update({ where: { codigo: 'LIC-01' }, data: { tasa: '160.00' } });
      await borrarCache(); // equivale a que venza el TTL de 240 s

      const respuesta = await consultar('?tipo=LICENCIA');

      expect((respuesta.body as { codigo: string; tasa: string }[])[0]).toMatchObject({
        codigo: 'LIC-01',
        tasa: '160.00',
      });
    } finally {
      await prisma.receta.update({ where: { codigo: 'LIC-01' }, data: { tasa: '159.50' } });
      await borrarCache();
    }
  });

  describe('lectura completa de recetas (fase 2 de la 003)', () => {
    const borrarFichas = async () => {
      const claves = await redis.keys('catalogo:receta:*');
      if (claves.length > 0) {
        await redis.del(...claves);
      }
    };

    beforeEach(borrarFichas);
    afterAll(borrarFichas);

    it('obtener devuelve LIC-03 completa, con requisitos en orden, y la guarda en caché', async () => {
      const repositorio = app.get<RepositorioCatalogo>(REPOSITORIO_CATALOGO);

      const receta = await repositorio.obtener('LIC-03');

      expect(receta?.calificacion).toBe('EVALUACION_PREVIA_SILENCIO_POSITIVO');
      expect(receta?.ordenItse).toBe('PREVIA');
      expect(receta?.requisitos.length).toBeGreaterThanOrEqual(8);
      const ordenes = receta?.requisitos.map((requisito) => requisito.orden) ?? [];
      expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b));
      expect(receta?.requisitos.every((requisito) => requisito.id !== null)).toBe(true);

      const ttl = await redis.ttl('catalogo:receta:LIC-03');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(240);
    });

    it('obtener devuelve null para un código que no existe', async () => {
      const repositorio = app.get<RepositorioCatalogo>(REPOSITORIO_CATALOGO);
      expect(await repositorio.obtener('LIC-00')).toBeNull();
    });

    it('listarTodas devuelve las 12 recetas ordenadas por código', async () => {
      const repositorio = app.get<RepositorioCatalogo>(REPOSITORIO_CATALOGO);

      const recetas = await repositorio.listarTodas();

      expect(recetas.map((receta) => receta.codigo.valor)).toEqual([
        'CGI-01',
        'DUP-01',
        'LIC-01',
        'LIC-02',
        'LIC-03',
        'LIC-04',
        'LIC-05',
        'LIC-06',
        'LIC-07',
        'LIC-08',
        'LIC-09',
        'TRF-01',
      ]);
    });
  });
});
