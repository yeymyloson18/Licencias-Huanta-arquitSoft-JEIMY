import type { RecetaCompleta } from '../dominio/receta-completa';
import type { RepositorioCatalogo } from '../dominio/repositorio-catalogo';

/** Caso de uso: una receta para editarla, aunque esté desactivada (FR-016, RF21). */
export class ObtenerRecetaAdmin {
  constructor(private readonly repositorio: RepositorioCatalogo) {}

  ejecutar(codigo: string): Promise<RecetaCompleta | null> {
    return this.repositorio.obtener(codigo);
  }
}
