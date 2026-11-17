import type Redis from 'ioredis';
import type { SondaDependencia } from '../dominio/sonda-dependencia';

// Estados de ioredis en los que hay una conexión en curso que terminará pronto.
const CONECTANDO = new Set(['connecting', 'connect']);

/** Adaptador: Redis responde si contesta `PING` (ioredis rechaza la promesa si falla). */
export class SondaRedis implements SondaDependencia {
  constructor(private readonly redis: Redis) {}

  async comprobar(): Promise<void> {
    // Sin cola offline (redis.proveedor.ts), PING se rechaza mientras la conexión se establece.
    // Si hay una conexión en curso se espera a que termine; el tiempo límite lo pone ConsultarSalud.
    // Si Redis está caído y reconectando, falla de inmediato.
    if (CONECTANDO.has(this.redis.status)) {
      await this.esperarConexion();
    }

    await this.redis.ping();
  }

  private esperarConexion(): Promise<void> {
    return new Promise<void>((resolver, rechazar) => {
      const limpiar = (): void => {
        this.redis.off('ready', listo);
        this.redis.off('error', fallo);
        this.redis.off('end', fallo);
      };
      const listo = (): void => {
        limpiar();
        resolver();
      };
      const fallo = (): void => {
        limpiar();
        rechazar(new Error('Redis no disponible'));
      };
      this.redis.on('ready', listo);
      this.redis.on('error', fallo);
      this.redis.on('end', fallo);
    });
  }
}
