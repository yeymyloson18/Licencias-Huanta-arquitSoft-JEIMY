import type { RecetaAlPresentar } from '../receta-al-presentar';

/** Puerto: la receta vigente del catálogo (la implementa un adaptador de la fachada de Catálogo). */
export interface CatalogoRecetas {
  /** `null` si no existe, está desactivada o no es una licencia (FR-008). */
  obtenerRecetaVigente(codigo: string): Promise<RecetaAlPresentar | null>;
}
