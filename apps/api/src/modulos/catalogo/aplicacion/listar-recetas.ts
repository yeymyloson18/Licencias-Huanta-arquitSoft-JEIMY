import { aDatosReceta, type Ruta, type TipoReceta } from '../dominio/receta';
import type { FiltroRecetas, RepositorioCatalogo } from '../dominio/repositorio-catalogo';

/** Resumen plano de una receta, propio de la capa de aplicación (no depende del contrato). */
export interface RecetaResumenDto {
  readonly codigo: string;
  readonly nombre: string;
  readonly tipo: TipoReceta;
  readonly ruta: Ruta | null;
  readonly tasa: string;
  readonly plazoDias: number | null;
}

/** Caso de uso: lista las recetas activas del catálogo, con filtro opcional por tipo (FR-012). */
export class ListarRecetas {
  constructor(private readonly repositorio: RepositorioCatalogo) {}

  async ejecutar(filtro: FiltroRecetas): Promise<RecetaResumenDto[]> {
    const recetas = await this.repositorio.listarActivas(filtro);
    return recetas.map(aDatosReceta);
  }
}
