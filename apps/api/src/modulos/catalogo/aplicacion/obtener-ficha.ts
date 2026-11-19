import type { RecetaCompleta } from '../dominio/receta-completa';
import type { RepositorioCatalogo } from '../dominio/repositorio-catalogo';

/**
 * Caso de uso: ficha pública de una receta (RF02, RF05). Una receta desactivada se trata igual que
 * una inexistente: el público no la ve (FR-013).
 */
export class ObtenerFicha {
  constructor(private readonly repositorio: RepositorioCatalogo) {}

  async ejecutar(codigo: string): Promise<RecetaCompleta | null> {
    const receta = await this.repositorio.obtener(codigo);
    return receta?.activa ? receta : null;
  }
}
