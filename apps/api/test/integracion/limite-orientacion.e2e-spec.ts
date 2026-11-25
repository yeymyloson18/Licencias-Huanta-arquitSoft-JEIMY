import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { ErrorLimitadorNoDisponible } from '../../src/modulos/orientacion/dominio/puertos';
import { LIMITADOR_PREGUNTAS } from '../../src/modulos/orientacion/tokens';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import {
  conProveedorSimulado,
  ProveedorOrientacionSimulado,
} from '../apoyo/proveedor-orientacion-simulado';
import { limpiarLimiteOrientacion } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Límite por persona del chat de orientación (012, US5, research R-08): 10 preguntas cada 15 minutos
// por huella de la conexión (HMAC con sal, sin la IP). Proveedor SIMULADO.

describe('Límite de preguntas de orientación (012, US5)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  const proveedor = new ProveedorOrientacionSimulado();

  const preguntar = (cuerpo: unknown) =>
    request(app.getHttpServer())
      .post('/api/v1/orientacion/preguntas')
      .send(cuerpo as object);

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba({ ajustar: conProveedorSimulado(proveedor) })) as {
      app: INestApplication<App>;
    });
    redis = app.get<Redis>(REDIS_CLIENTE);
  });

  beforeEach(async () => {
    proveedor.reiniciar();
    proveedor.responderCon({ tipo: 'RESPONDIDA', texto: 'En la caja de la Municipalidad.' });
    await limpiarLimiteOrientacion(redis);
  });

  afterAll(async () => {
    await limpiarLimiteOrientacion(redis);
    await app.close();
  });

  it('10 preguntas responden 200; la 11.ª responde 429 con Retry-After y no llega al proveedor', async () => {
    for (let pregunta = 1; pregunta <= 10; pregunta += 1) {
      await preguntar({ pregunta: `¿Cómo pago? (${String(pregunta)})` }).expect(200);
    }

    const once = await preguntar({ pregunta: '¿Cómo pago? (11)' });

    expect(once.status).toBe(429);
    await esperarCumpleContrato('post', '/orientacion/preguntas', once);
    expect((once.body as { type: string }).type).toMatch(/demasiadas-preguntas$/);
    const reintentar = Number(once.headers['retry-after']);
    expect(reintentar).toBeGreaterThanOrEqual(1);
    expect(reintentar).toBeLessThanOrEqual(900);
    expect(proveedor.llamadas).toHaveLength(10);
  });

  it('las preguntas rechazadas con 422 no cuentan para el límite', async () => {
    const invalidas = [
      {},
      { pregunta: '' },
      { pregunta: '     ' },
      { pregunta: 'a'.repeat(501) },
      {
        pregunta: '¿Y?',
        historial: Array.from({ length: 7 }, () => ({ rol: 'PERSONA', texto: 'x' })),
      },
      { pregunta: '¿Y?', usuarioId: 'abc' },
    ];
    for (const cuerpo of invalidas) {
      await preguntar(cuerpo).expect(422);
    }

    for (let pregunta = 1; pregunta <= 10; pregunta += 1) {
      await preguntar({ pregunta: '¿Cómo pago?' }).expect(200);
    }
  });

  it('la clave del límite es una huella: no contiene la IP', async () => {
    await preguntar({ pregunta: '¿Cómo pago?' }).expect(200);

    const claves = await redis.keys('lim:orientacion:*');
    expect(claves).toHaveLength(1);
    expect(claves[0]).toMatch(/^lim:orientacion:[0-9a-f]{64}$/);
    expect(claves[0]).not.toContain('127.0.0.1');
  });
});

describe('Límite de preguntas sin Redis (012, US5)', () => {
  it('si el límite no se puede comprobar responde 503 orientacion-no-disponible', async () => {
    const proveedor = new ProveedorOrientacionSimulado();
    const { app } = (await crearAplicacionDePrueba({
      ajustar: conProveedorSimulado(proveedor, (constructor) =>
        constructor.overrideProvider(LIMITADOR_PREGUNTAS).useValue({
          reservar: () => Promise.reject(new ErrorLimitadorNoDisponible()),
        }),
      ),
    })) as { app: INestApplication<App> };
    try {
      const respuesta = await request(app.getHttpServer())
        .post('/api/v1/orientacion/preguntas')
        .send({ pregunta: '¿Cómo pago?' });

      expect(respuesta.status).toBe(503);
      await esperarCumpleContrato('post', '/orientacion/preguntas', respuesta);
      expect((respuesta.body as { type: string }).type).toMatch(/orientacion-no-disponible$/);
      expect(proveedor.llamadas).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
