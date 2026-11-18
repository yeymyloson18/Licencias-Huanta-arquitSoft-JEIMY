import type { RecetaCompleta } from '../dominio/receta-completa';
import type { RepositorioCatalogo } from '../dominio/repositorio-catalogo';

/** Caso de uso: todas las recetas, activas y desactivadas, para el administrador (FR-016). */
export class ListarRecetasAdmin {
  constructor(private readonly repositorio: RepositorioCatalogo) {}

  ejecutar(): Promise<RecetaCompleta[]> {
    return this.repositorio.listarTodas();
  }
}
