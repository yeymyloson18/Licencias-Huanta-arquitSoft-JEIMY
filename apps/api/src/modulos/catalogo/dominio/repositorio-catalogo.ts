import type { Receta, TipoReceta } from './receta';
import type { RecetaCompleta } from './receta-completa';

export interface FiltroRecetas {
  readonly tipo?: TipoReceta;
}

/** Puerto: lectura del catálogo de recetas. */
export interface RepositorioCatalogo {
  /** Recetas activas, ordenadas por código. */
  listarActivas(filtro: FiltroRecetas): Promise<Receta[]>;

  /** Receta completa (con requisitos en orden), activa o no; `null` si no existe. */
  obtener(codigo: string): Promise<RecetaCompleta | null>;

  /** Todas las recetas completas, activas y desactivadas, ordenadas por código (administración). */
  listarTodas(): Promise<RecetaCompleta[]>;
}
