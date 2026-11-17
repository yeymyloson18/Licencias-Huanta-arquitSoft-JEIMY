import { EventEmitter } from 'node:events';
import type Redis from 'ioredis';
import { SondaRedis } from '../../../../src/operacion/salud/infraestructura/sonda-redis';

// Reproduce el error encontrado en la prueba de integración: justo después de arrancar, la conexión
// con Redis aún se está estableciendo y, sin cola offline, PING se rechazaba aunque Redis estuviera
// sano (la salud informaba DEGRADADO por unos milisegundos).
class RedisFalso extends EventEmitter {
  status = 'ready';
  respuestaPing: Promise<string> = Promise.resolve('PONG');
  ping(): Promise<string> {
    return this.status === 'ready'
      ? this.respuestaPing
      : Promise.reject(new Error("Stream isn't writeable"));
  }
}

const crearSonda = (redis: RedisFalso) => new SondaRedis(redis as unknown as Redis);

describe('SondaRedis', () => {
  it('responde si Redis contesta PONG', async () => {
    await expect(crearSonda(new RedisFalso()).comprobar()).resolves.toBeUndefined();
  });

  it('rechaza si PING falla', async () => {
    const redis = new RedisFalso();
    redis.respuestaPing = Promise.reject(new Error('LOADING'));

    await expect(crearSonda(redis).comprobar()).rejects.toThrow('LOADING');
  });

  it.each(['connecting', 'connect'])(
    'espera a que termine una conexión en curso (estado %s) antes de enviar PING',
    async (estado) => {
      const redis = new RedisFalso();
      redis.status = estado;
      const comprobacion = crearSonda(redis).comprobar();

      redis.status = 'ready';
      redis.emit('ready');

      await expect(comprobacion).resolves.toBeUndefined();
      expect(redis.listenerCount('ready')).toBe(0);
      expect(redis.listenerCount('error')).toBe(0);
    },
  );

  it('rechaza si la conexión en curso termina en error', async () => {
    const redis = new RedisFalso();
    redis.status = 'connecting';
    const comprobacion = crearSonda(redis).comprobar();

    redis.emit('error', new Error('ECONNREFUSED'));

    await expect(comprobacion).rejects.toThrow('Redis no disponible');
    expect(redis.listenerCount('ready')).toBe(0);
  });

  it('falla de inmediato si Redis está caído y reconectando', async () => {
    const redis = new RedisFalso();
    redis.status = 'reconnecting';

    await expect(crearSonda(redis).comprobar()).rejects.toThrow();
  });
});
