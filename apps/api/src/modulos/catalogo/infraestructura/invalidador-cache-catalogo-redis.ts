import { Logger } from '@nestjs/common';
import type { InvalidadorCacheCatalogo } from '../dominio/invalidador-cache-catalogo';
import { TIPOS_RECETA } from '../dominio/receta';
import { CLAVES_CACHE_CATALOGO } from './repositorio-catalogo-con-cache';

/** Lo que este adaptador necesita de Redis (ioredis lo cumple). */
export interface ClienteCacheBorrable {
  del(...claves: string[]): Promise<number>;
}

/**
 * Borra de Redis la ficha de la receta y las tres listas públicas (research §R-06 de la 003). Si
 * Redis falla, solo deja un aviso con el código de la receta: el TTL de 240 s pone el límite.
 */
export class InvalidadorCacheCatalogoRedis implements InvalidadorCacheCatalogo {
  private readonly registro = new Logger('Catalogo');

  constructor(private readonly cache: ClienteCacheBorrable) {}

  async invalidar(codigo: string): Promise<void> {
    const claves = [
      CLAVES_CACHE_CATALOGO.receta(codigo),
      CLAVES_CACHE_CATALOGO.lista(undefined),
      ...TIPOS_RECETA.map((tipo) => CLAVES_CACHE_CATALOGO.lista(tipo)),
    ];
    try {
      await this.cache.del(...claves);
    } catch {
      this.registro.warn(`Caché del catálogo no disponible al invalidar codigo=${codigo}`);
    }
  }
}
