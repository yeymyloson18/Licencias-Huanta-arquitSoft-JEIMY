import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import type { Usuario } from '../dominio/usuario';

export interface PaginaDeUsuarios {
  readonly usuarios: readonly Usuario[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
}

export interface FiltroListado {
  readonly activo?: boolean;
  readonly pagina: number;
  readonly porPagina: number;
}

/** Lista el personal, paginado y ordenado por nombre, con filtro por estado (FR-016). */
export class ListarUsuarios {
  constructor(private readonly d: { readonly usuarios: RepositorioUsuarios }) {}

  async ejecutar(filtro: FiltroListado): Promise<PaginaDeUsuarios> {
    const { usuarios, total } = await this.d.usuarios.buscar(filtro);
    return { usuarios, total, pagina: filtro.pagina, porPagina: filtro.porPagina };
  }
}
