import { Logger } from '@nestjs/common';
import { aDatosReceta, crearReceta, type DatosReceta, type Receta } from '../dominio/receta';
import type { FiltroRecetas, RepositorioCatalogo } from '../dominio/repositorio-catalogo';

/** Lo que este adaptador necesita de Redis (ioredis lo cumple). */
export interface ClienteCache {
  get(clave: string): Promise<string | null>;
  set(clave: string, valor: string, modo: 'EX', segundos: number): Promise<unknown>;
}

const PREFIJO = 'catalogo:recetas:';

/**
 * Decorator con cache-aside sobre el repositorio del catálogo (research.md §R-05, patrón del
 * diseño interno). Si Redis falla, el catálogo se sigue sirviendo desde PostgreSQL.
 */
export class RepositorioCatalogoConCache implements RepositorioCatalogo {
  private readonly registro = new Logger('Catalogo');

  constructor(
    private readonly interno: RepositorioCatalogo,
    private readonly cache: ClienteCache,
    private readonly ttlSegundos: number,
  ) {}

  async listarActivas(filtro: FiltroRecetas): Promise<Receta[]> {
    const clave = `${PREFIJO}${filtro.tipo ?? 'TODOS'}`;

    const enCache = await this.leer(clave);
    if (enCache) {
      return enCache;
    }

    const recetas = await this.interno.listarActivas(filtro);
    await this.guardar(clave, recetas);
    return recetas;
  }

  private async leer(clave: string): Promise<Receta[] | null> {
    let valor: string | null;
    try {
      valor = await this.cache.get(clave);
    } catch {
      this.avisarCacheNoDisponible();
      return null;
    }
    if (valor === null) {
      return null;
    }
    try {
      return (JSON.parse(valor) as DatosReceta[]).map(crearReceta);
    } catch {
      // Valor corrupto o de una versión anterior: se ignora y se vuelve a leer de la base.
      return null;
    }
  }

  private async guardar(clave: string, recetas: Receta[]): Promise<void> {
    try {
      await this.cache.set(
        clave,
        JSON.stringify(recetas.map(aDatosReceta)),
        'EX',
        this.ttlSegundos,
      );
    } catch {
      this.avisarCacheNoDisponible();
    }
  }

  private avisarCacheNoDisponible(): void {
    this.registro.warn('Caché del catálogo no disponible');
  }
}
