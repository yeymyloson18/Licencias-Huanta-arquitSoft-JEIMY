import type { Receta, TipoReceta } from './receta';

export interface FiltroRecetas {
  readonly tipo?: TipoReceta;
}

/** Puerto: lectura del catálogo de recetas. */
export interface RepositorioCatalogo {
  /** Recetas activas, ordenadas por código. */
  listarActivas(filtro: FiltroRecetas): Promise<Receta[]>;
}
