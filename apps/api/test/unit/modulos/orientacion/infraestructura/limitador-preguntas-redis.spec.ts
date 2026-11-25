import { ErrorLimitadorNoDisponible } from '../../../../../src/modulos/orientacion/dominio/puertos';
import {
  type ClienteRedisLimite,
  LimitadorPreguntasRedis,
} from '../../../../../src/modulos/orientacion/infraestructura/limitador-preguntas-redis';

// research R-08 de la 012: mismo algoritmo que el límite de intentos de la 002 (INCR + EXPIRE NX +
// TTL en un MULTI, ventana fija de 15 minutos). Doble propio de Redis: el proyecto no usa
// ioredis-mock.

class RedisDoble implements ClienteRedisLimite {
  readonly contadores = new Map<string, number>();
  readonly vencimientos = new Map<string, number>();
  readonly expires: [string, number, string][] = [];
  fallar = false;
  resultadoNulo = false;

  multi() {
    const operaciones: (() => [Error | null, unknown])[] = [];
    const lote = {
      incr: (clave: string) => {
        operaciones.push(() => {
          const valor = (this.contadores.get(clave) ?? 0) + 1;
          this.contadores.set(clave, valor);
          return [null, valor];
        });
        return lote;
      },
      expire: (clave: string, segundos: number, modo: 'NX') => {
        operaciones.push(() => {
          this.expires.push([clave, segundos, modo]);
          if (!this.vencimientos.has(clave)) {
            this.vencimientos.set(clave, segundos);
            return [null, 1];
          }
          return [null, 0];
        });
        return lote;
      },
      ttl: (clave: string) => {
        operaciones.push(() => [null, this.vencimientos.get(clave) ?? -1]);
        return lote;
      },
      exec: () => {
        if (this.fallar) {
          return Promise.reject(new Error('Redis no responde'));
        }
        if (this.resultadoNulo) {
          return Promise.resolve(null);
        }
        return Promise.resolve(operaciones.map((operacion) => operacion()));
      },
    };
    return lote;
  }
}

describe('LimitadorPreguntasRedis', () => {
  it('permite 10 preguntas y rechaza la 11.ª con los segundos que faltan', async () => {
    const redis = new RedisDoble();
    const limitador = new LimitadorPreguntasRedis(redis, 10);

    for (let pregunta = 1; pregunta <= 10; pregunta += 1) {
      await expect(limitador.reservar('abc123')).resolves.toEqual({
        permitido: true,
        segundosRestantes: 0,
      });
    }
    const once = await limitador.reservar('abc123');

    expect(once.permitido).toBe(false);
    expect(once.segundosRestantes).toBeGreaterThan(0);
    expect(once.segundosRestantes).toBeLessThanOrEqual(900);
  });

  it('usa la clave lim:orientacion:<huella> con ventana fija de 900 s (EXPIRE NX)', async () => {
    const redis = new RedisDoble();

    await new LimitadorPreguntasRedis(redis, 10).reservar('abc123');

    expect([...redis.contadores.keys()]).toEqual(['lim:orientacion:abc123']);
    expect(redis.expires).toEqual([['lim:orientacion:abc123', 900, 'NX']]);
  });

  it('cada huella tiene su propio contador', async () => {
    const redis = new RedisDoble();
    const limitador = new LimitadorPreguntasRedis(redis, 1);

    await limitador.reservar('a');

    await expect(limitador.reservar('b')).resolves.toMatchObject({ permitido: true });
    await expect(limitador.reservar('a')).resolves.toMatchObject({ permitido: false });
  });

  it('sin TTL (no debería pasar) asume la ventana completa', async () => {
    const redis = new RedisDoble();
    redis.contadores.set('lim:orientacion:x', 5);
    redis.vencimientos.set('lim:orientacion:x', -1);

    await expect(new LimitadorPreguntasRedis(redis, 5).reservar('x')).resolves.toEqual({
      permitido: false,
      segundosRestantes: 900,
    });
  });

  it.each([
    ['falla', (redis: RedisDoble) => (redis.fallar = true)],
    ['no devuelve resultados', (redis: RedisDoble) => (redis.resultadoNulo = true)],
  ])('si Redis %s lanza ErrorLimitadorNoDisponible (falla cerrado)', async (_caso, romper) => {
    const redis = new RedisDoble();
    romper(redis);

    await expect(new LimitadorPreguntasRedis(redis, 10).reservar('x')).rejects.toBeInstanceOf(
      ErrorLimitadorNoDisponible,
    );
  });
});
