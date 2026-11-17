import { Inject, Injectable, Logger, OnModuleDestroy, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { CONFIGURACION, type Configuracion } from './configuracion';

// Cliente Redis compartido (research.md §R-05): sin cola offline para fallar rápido si Redis cae,
// y reconexión indefinida para volver a OK sin reiniciar la API.
export const REDIS_CLIENTE = Symbol('REDIS_CLIENTE');

const registro = new Logger('Redis');

export const crearClienteRedis = (url: string): Redis => {
  const cliente = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (intentos: number) => Math.min(intentos * 200, 5000),
  });

  let avisado = false;
  cliente.on('error', () => {
    // Un solo aviso por caída, sin URL ni detalle del error (principio VII).
    if (!avisado) {
      registro.warn('Redis no disponible');
      avisado = true;
    }
  });
  cliente.on('ready', () => {
    avisado = false;
  });

  // Conexión en segundo plano: no bloquea el arranque si Redis aún no está listo.
  cliente.connect().catch(() => undefined);
  return cliente;
};

export const proveedorRedis: Provider = {
  provide: REDIS_CLIENTE,
  inject: [CONFIGURACION],
  useFactory: (configuracion: Configuracion): Redis => crearClienteRedis(configuracion.urlRedis),
};

@Injectable()
export class CierreRedis implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENTE) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
