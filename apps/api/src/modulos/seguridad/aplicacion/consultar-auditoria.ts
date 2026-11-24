import { fechaLima } from '../../../compartido/dominio/fecha-lima';
import { textoAccion } from '../dominio/accion-auditoria';
import { aCsvAuditoria, MAXIMO_FILAS_CSV } from '../dominio/csv-auditoria';
import { type EntradaFiltroAuditoria, resolverFiltroAuditoria } from '../dominio/filtro-auditoria';
import type { Reloj } from '../dominio/puertos/reloj';
import type { FilaAuditoria, RepositorioAuditoria } from '../dominio/puertos/repositorio-auditoria';

export interface DependenciasConsultarAuditoria {
  readonly auditoria: RepositorioAuditoria;
  readonly reloj: Reloj;
}

/** Fila para la pantalla: la del repositorio más el texto de la acción en español. */
export interface EventoAuditoriaVista extends FilaAuditoria {
  readonly textoAccion: string;
}

export interface PaginaAuditoriaVista {
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
  readonly datos: readonly EventoAuditoriaVista[];
}

export interface DescargaAuditoria {
  readonly contenido: string;
  /** Había más de 10,000 filas: solo van las más recientes. */
  readonly truncado: boolean;
  /** `auditoria-seguridad-<AAAA-MM-DD>.csv` (fecha de Lima). */
  readonly nombreArchivo: string;
}

export const aVista = (fila: FilaAuditoria): EventoAuditoriaVista => ({
  ...fila,
  textoAccion: textoAccion(fila.accion),
});

/**
 * Auditoría de seguridad del administrador (HU2 de la 009): paginada de la más reciente a la más
 * antigua, o en CSV con los mismos filtros. Lanza `ErrorFiltroAuditoria` si las fechas no sirven.
 */
export class ConsultarAuditoria {
  constructor(private readonly d: DependenciasConsultarAuditoria) {}

  async pagina(
    entrada: EntradaFiltroAuditoria,
    pagina: number,
    porPagina: number,
  ): Promise<PaginaAuditoriaVista> {
    const filtro = resolverFiltroAuditoria(entrada, fechaLima(this.d.reloj.ahora()));
    const resultado = await this.d.auditoria.buscar(filtro, (pagina - 1) * porPagina, porPagina);
    return { pagina, porPagina, total: resultado.total, datos: resultado.filas.map(aVista) };
  }

  async csv(entrada: EntradaFiltroAuditoria): Promise<DescargaAuditoria> {
    const hoy = fechaLima(this.d.reloj.ahora());
    const filtro = resolverFiltroAuditoria(entrada, hoy);
    const resultado = await this.d.auditoria.buscar(filtro, 0, MAXIMO_FILAS_CSV);
    return {
      contenido: aCsvAuditoria(resultado.filas),
      truncado: resultado.total > MAXIMO_FILAS_CSV,
      nombreArchivo: `auditoria-seguridad-${hoy}.csv`,
    };
  }
}
