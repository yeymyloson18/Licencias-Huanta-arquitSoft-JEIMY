import type { FachadaCatalogo } from '../../catalogo/fachada';
import type { CatalogoRecetas } from '../dominio/puertos/catalogo-recetas';
import type { RecetaAlPresentar } from '../dominio/receta-al-presentar';

/** Adaptador del puerto `CatalogoRecetas` sobre la fachada del módulo Catálogo (principio I). */
export class CatalogoRecetasFachada implements CatalogoRecetas {
  constructor(private readonly catalogo: FachadaCatalogo) {}

  async obtenerRecetaVigente(codigo: string): Promise<RecetaAlPresentar | null> {
    const receta = await this.catalogo.obtenerRecetaVigente(codigo);
    return receta === null ? null : { ...receta, requisitos: [...receta.requisitos] };
  }
}
