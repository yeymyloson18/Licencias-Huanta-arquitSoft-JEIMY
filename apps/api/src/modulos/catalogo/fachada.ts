import type { ListarRecetas, RecetaResumenDto } from './aplicacion/listar-recetas';
import type { FiltroRecetas } from './dominio/repositorio-catalogo';

// Fachada pública del módulo Catálogo: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

export type { RecetaResumenDto } from './aplicacion/listar-recetas';
export type { TipoReceta } from './dominio/receta';
export type { FiltroRecetas } from './dominio/repositorio-catalogo';

export class FachadaCatalogo {
  constructor(private readonly listarRecetasCasoDeUso: ListarRecetas) {}

  listarRecetas(filtro: FiltroRecetas): Promise<RecetaResumenDto[]> {
    return this.listarRecetasCasoDeUso.ejecutar(filtro);
  }
}
