import { huellaCorta, normalizarTexto } from '../dominio/csv';
import type {
  CacheReportes,
  FilaReporte,
  FuenteLicencias,
  FuenteTramites,
} from '../dominio/puertos';
import { conCache } from './cache';

/** El reporte devuelve hasta 5,000 filas (FR-011 de la 007). */
export const LIMITE_FILAS = 5000;

export type Situacion = 'VIGENTES' | 'EN_TRAMITE' | 'ITSE_POR_VENCER';

export interface FiltroReporte {
  readonly situacion: Situacion;
  readonly codigoReceta?: string;
  readonly giro?: string;
  readonly zona?: string;
}

export interface ResultadoReporte {
  readonly filas: readonly FilaReporte[];
  /** Había más de 5,000 filas: conviene ajustar los filtros. */
  readonly truncado: boolean;
}

/** Reporte de licencias por situación, tipo de licencia, giro y zona (historia 2 de la 007). */
export class ReporteLicencias {
  constructor(
    private readonly d: {
      readonly tramites: Pick<FuenteTramites, 'expedientesEnTramite'>;
      readonly licencias: FuenteLicencias;
      readonly cache: CacheReportes;
      readonly avisar: (mensaje: string) => void;
    },
  ) {}

  ejecutar(filtro: FiltroReporte): Promise<ResultadoReporte> {
    const giro = filtro.giro === undefined ? '' : normalizarTexto(filtro.giro);
    const zona = filtro.zona === undefined ? '' : normalizarTexto(filtro.zona);
    const clave = `rep:licencias:${filtro.situacion}:${filtro.codigoReceta ?? '*'}:${huellaCorta(`${giro}|${zona}`)}`;
    return conCache(
      this.d.cache,
      clave,
      async () => {
        const todas = await this.filasDe(filtro.situacion, filtro.codigoReceta);
        const filtradas = todas.filter(
          (fila) =>
            (giro === '' || normalizarTexto(fila.giro) === giro) &&
            (zona === '' || normalizarTexto(fila.zona) === zona),
        );
        return {
          filas: filtradas.slice(0, LIMITE_FILAS),
          truncado: filtradas.length > LIMITE_FILAS,
        };
      },
      this.d.avisar,
    );
  }

  private filasDe(situacion: Situacion, codigoReceta: string | undefined): Promise<FilaReporte[]> {
    switch (situacion) {
      case 'VIGENTES':
        return this.d.licencias.vigentes(codigoReceta);
      case 'ITSE_POR_VENCER':
        return this.d.licencias.itsePorVencer(codigoReceta);
      case 'EN_TRAMITE':
        return this.d.tramites.expedientesEnTramite(codigoReceta);
    }
  }
}
