import { Correo } from '../dominio/correo';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { leerCampo } from './leer-campos';
import type { FiltroListado, PaginaDeUsuarios } from './listar-usuarios';

/**
 * Busca personal por un fragmento del nombre o por el correo completo (FR-016). El correo se guarda
 * cifrado, así que solo se puede comparar entero, por su HMAC (research.md §R-04 y §R-13).
 */
export class BuscarUsuarios {
  constructor(private readonly d: { readonly usuarios: RepositorioUsuarios }) {}

  async ejecutar(filtro: FiltroListado & { readonly texto?: string }): Promise<PaginaDeUsuarios> {
    const texto = filtro.texto?.trim();
    const correo =
      texto === undefined || !texto.includes('@')
        ? null
        : leerCampo('texto', [], () => Correo.crear(texto));
    const { usuarios, total } = await this.d.usuarios.buscar({
      activo: filtro.activo,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
      ...(texto === undefined || texto === '' ? {} : { texto }),
      ...(correo === null ? {} : { correo }),
    });
    return { usuarios, total, pagina: filtro.pagina, porPagina: filtro.porPagina };
  }
}
