import { Logger } from '@nestjs/common';
import type { DatosAsistente } from '../dominio/pregunta-asistente';
import { aDatosReceta, crearReceta, type DatosReceta, type Receta } from '../dominio/receta';
import {
  aDatosRecetaCompleta,
  crearRecetaCompleta,
  type DatosRecetaCompleta,
  type RecetaCompleta,
} from '../dominio/receta-completa';
import type { FiltroRecetas, RepositorioCatalogo } from '../dominio/repositorio-catalogo';

/** Lo que este adaptador necesita de Redis (ioredis lo cumple). */
export interface ClienteCache {
  get(clave: string): Promise<string | null>;
  set(clave: string, valor: string, modo: 'EX', segundos: number): Promise<unknown>;
}

/** Claves de Redis del catálogo (research.md §R-06 de la 003). */
export const CLAVES_CACHE_CATALOGO = {
  lista: (tipo: FiltroRecetas['tipo']): string => `catalogo:recetas:${tipo ?? 'TODOS'}`,
  receta: (codigo: string): string => `catalogo:receta:${codigo}`,
  asistente: 'catalogo:asistente',
} as const;

/** Comprobación mínima de un valor del asistente leído de la caché. */
const esDatosAsistente = (valor: unknown): valor is DatosAsistente =>
  typeof valor === 'object' &&
  valor !== null &&
  Array.isArray((valor as DatosAsistente).preguntas) &&
  Array.isArray((valor as DatosAsistente).reglas);

/**
 * Decorator con cache-aside sobre el repositorio del catálogo (research.md §R-05 de la 001 y §R-06
 * de la 003, patrón del diseño interno). Si Redis falla, el catálogo se sigue sirviendo desde
 * PostgreSQL. `listarTodas` es solo para administración y no pasa por la caché.
 */
export class RepositorioCatalogoConCache implements RepositorioCatalogo {
  private readonly registro = new Logger('Catalogo');

  constructor(
    private readonly interno: RepositorioCatalogo,
    private readonly cache: ClienteCache,
    private readonly ttlSegundos: number,
  ) {}

  async listarActivas(filtro: FiltroRecetas): Promise<Receta[]> {
    const clave = CLAVES_CACHE_CATALOGO.lista(filtro.tipo);

    const enCache = await this.leer(clave, (valor) =>
      (JSON.parse(valor) as DatosReceta[]).map(crearReceta),
    );
    if (enCache) {
      return enCache;
    }

    const recetas = await this.interno.listarActivas(filtro);
    await this.guardar(clave, JSON.stringify(recetas.map(aDatosReceta)));
    return recetas;
  }

  async obtener(codigo: string): Promise<RecetaCompleta | null> {
    const clave = CLAVES_CACHE_CATALOGO.receta(codigo);

    const enCache = await this.leer(clave, (valor) =>
      crearRecetaCompleta(JSON.parse(valor) as DatosRecetaCompleta),
    );
    if (enCache) {
      return enCache;
    }

    const receta = await this.interno.obtener(codigo);
    // Un código inexistente no se guarda: no hay nada que invalidar después.
    if (receta) {
      await this.guardar(clave, JSON.stringify(aDatosRecetaCompleta(receta)));
    }
    return receta;
  }

  listarTodas(): Promise<RecetaCompleta[]> {
    return this.interno.listarTodas();
  }

  /** Las preguntas y reglas solo cambian por migración: no se invalidan, vencen con el TTL. */
  async obtenerAsistente(): Promise<DatosAsistente> {
    const clave = CLAVES_CACHE_CATALOGO.asistente;

    const enCache = await this.leer(clave, (valor) => {
      const datos: unknown = JSON.parse(valor);
      if (!esDatosAsistente(datos)) {
        throw new Error('Valor del asistente con forma inesperada');
      }
      return datos;
    });
    if (enCache) {
      return enCache;
    }

    const datos = await this.interno.obtenerAsistente();
    await this.guardar(clave, JSON.stringify(datos));
    return datos;
  }

  private async leer<T>(clave: string, convertir: (valor: string) => T): Promise<T | null> {
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
      return convertir(valor);
    } catch {
      // Valor corrupto o de una versión anterior: se ignora y se vuelve a leer de la base.
      return null;
    }
  }

  private async guardar(clave: string, valor: string): Promise<void> {
    try {
      await this.cache.set(clave, valor, 'EX', this.ttlSegundos);
    } catch {
      this.avisarCacheNoDisponible();
    }
  }

  private avisarCacheNoDisponible(): void {
    this.registro.warn('Caché del catálogo no disponible');
  }
}
