import { once } from 'node:events';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { configurarAplicacion } from '../../src/configurar-aplicacion';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Asistente de ruta (historia 1 de la 003, contracts/asistente.md). Requiere PostgreSQL con las
// migraciones aplicadas y Redis.
process.env.DATABASE_URL ??=
  'postgresql://licencias:cambiar_en_produccion_solo_desarrollo@localhost:5432/licencias';
process.env.REDIS_URL ??= 'redis://localhost:6379';

interface Pregunta {
  codigo: string;
  opciones: { valor: string; texto: string }[];
}
interface Propuesta {
  resultado: 'PROPUESTA';
  receta: { codigo: string; tasa: string; requisitos: unknown[] };
}
interface NoDeterminada {
  resultado: 'NO_DETERMINADA';
  motivo: string;
}
interface ConErrores {
  errores: { campo: string; mensaje: string }[];
}

describe('Asistente de ruta (/asistente)', () => {
  let app: INestApplication;
  let redis: Redis;
  let prisma: PrismaServicio;

  const servidor = () => app.getHttpServer() as Parameters<typeof request>[0];
  const proponer = (cuerpo: unknown) =>
    request(servidor())
      .post('/api/v1/asistente/proponer')
      .send(cuerpo as object);
  const respuestas = (tipo: string, cesionario: string, riesgo: string) => ({
    respuestas: { TIPO_ESTABLECIMIENTO: tipo, ES_CESIONARIO: cesionario, NIVEL_RIESGO: riesgo },
  });

  const borrarCache = async () => {
    const claves = await redis.keys('catalogo:*');
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
    await borrarCache();
    await app.close();
  });

  beforeEach(borrarCache);

  describe('GET /asistente/preguntas', () => {
    it('devuelve las 3 preguntas en orden, con "No lo sé" al final del nivel de riesgo', async () => {
      const respuesta = await request(servidor()).get('/api/v1/asistente/preguntas');

      expect(respuesta.status).toBe(200);
      await esperarCumpleContrato('get', '/asistente/preguntas', respuesta);
      expect(respuesta.headers['cache-control']).toBe('public, max-age=60');
      const preguntas = respuesta.body as Pregunta[];
      expect(preguntas.map((pregunta) => pregunta.codigo)).toEqual([
        'TIPO_ESTABLECIMIENTO',
        'ES_CESIONARIO',
        'NIVEL_RIESGO',
      ]);
      expect(preguntas[2]?.opciones).toHaveLength(5);
      expect(preguntas[2]?.opciones.at(-1)?.valor).toBe('NO_SE');
    });

    it('guarda las preguntas y reglas en Redis con un TTL de 240 s como máximo', async () => {
      await request(servidor()).get('/api/v1/asistente/preguntas');

      const ttl = await redis.ttl('catalogo:asistente');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(240);
    });
  });

  describe('POST /asistente/proponer', () => {
    it('OTRO / NO / MEDIO propone LIC-02 con su tasa y sus requisitos', async () => {
      const respuesta = await proponer(respuestas('OTRO', 'NO', 'MEDIO'));

      expect(respuesta.status).toBe(200);
      await esperarCumpleContrato('post', '/asistente/proponer', respuesta);
      expect(respuesta.headers['cache-control']).toBe('no-store');
      const cuerpo = respuesta.body as Propuesta;
      expect(cuerpo.resultado).toBe('PROPUESTA');
      expect(cuerpo.receta).toMatchObject({ codigo: 'LIC-02', tasa: '177.10' });
      expect(cuerpo.receta.requisitos.length).toBeGreaterThan(0);
    });

    it('BODEGA propone LIC-09 gratuita', async () => {
      const respuesta = await proponer(respuestas('BODEGA', 'NO', 'BAJO'));

      expect(respuesta.status).toBe(200);
      await esperarCumpleContrato('post', '/asistente/proponer', respuesta);
      expect((respuesta.body as Propuesta).receta).toMatchObject({
        codigo: 'LIC-09',
        tasa: '0.00',
      });
    });

    it('OTRO / NO / NO_SE no determina la licencia (SIN_REGLA)', async () => {
      const respuesta = await proponer(respuestas('OTRO', 'NO', 'NO_SE'));

      expect(respuesta.status).toBe(200);
      await esperarCumpleContrato('post', '/asistente/proponer', respuesta);
      expect(respuesta.body as NoDeterminada).toEqual({
        resultado: 'NO_DETERMINADA',
        motivo: 'SIN_REGLA',
      });
    });

    it('sin NIVEL_RIESGO responde 422 en respuestas.NIVEL_RIESGO', async () => {
      const respuesta = await proponer({
        respuestas: { TIPO_ESTABLECIMIENTO: 'OTRO', ES_CESIONARIO: 'NO' },
      });

      expect(respuesta.status).toBe(422);
      await esperarCumpleContrato('post', '/asistente/proponer', respuesta);
      expect((respuesta.body as ConErrores).errores.map((error) => error.campo)).toEqual([
        'respuestas.NIVEL_RIESGO',
      ]);
    });

    it('un valor fuera de las opciones responde 422 sin repetir el valor', async () => {
      const respuesta = await proponer(respuestas('OTRO', 'NO', 'ENORME'));

      expect(respuesta.status).toBe(422);
      await esperarCumpleContrato('post', '/asistente/proponer', respuesta);
      expect((respuesta.body as ConErrores).errores[0]?.campo).toBe('respuestas.NIVEL_RIESGO');
      expect(JSON.stringify(respuesta.body)).not.toContain('ENORME');
    });

    it.each([
      ['sin respuestas', {}],
      ['respuestas que no son texto', { respuestas: { TIPO_ESTABLECIMIENTO: 1 } }],
      ['respuestas que no son un objeto', { respuestas: 'OTRO' }],
    ])('un cuerpo %s responde 422 en respuestas', async (_caso, cuerpo) => {
      const respuesta = await proponer(cuerpo);

      expect(respuesta.status).toBe(422);
      await esperarCumpleContrato('post', '/asistente/proponer', respuesta);
      expect((respuesta.body as ConErrores).errores[0]?.campo).toBe('respuestas');
    });

    it('un cambio de tasa en el catálogo se ve en la propuesta sin tocar código (EQ-06)', async () => {
      try {
        await prisma.receta.update({ where: { codigo: 'LIC-02' }, data: { tasa: '180.00' } });
        await redis.del('catalogo:receta:LIC-02');

        const respuesta = await proponer(respuestas('OTRO', 'NO', 'MEDIO'));

        expect((respuesta.body as Propuesta).receta.tasa).toBe('180.00');
      } finally {
        await prisma.receta.update({ where: { codigo: 'LIC-02' }, data: { tasa: '177.10' } });
        await redis.del('catalogo:receta:LIC-02');
      }
    });
  });
});
