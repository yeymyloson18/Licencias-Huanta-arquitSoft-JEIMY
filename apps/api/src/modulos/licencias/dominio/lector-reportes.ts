import type { Fecha } from '../../../compartido/dominio/fecha-lima';

/** Fila de licencia para el reporte de la jefatura (007): solo el titular público. */
export interface LicenciaParaReporte {
  readonly numero: string;
  readonly codigoReceta: string;
  readonly titularPublico: string;
  readonly giro: string;
  readonly zona: string;
  readonly estado: string;
  /** Emisión (vigentes) o vencimiento del certificado ITSE (por vencer). */
  readonly fecha: Fecha;
}

/** Puerto: licencias vigentes y con certificado ITSE por vencer (reporte de la jefatura, 007). */
export interface LectorLicenciasParaReportes {
  /** Vigentes, ordenadas por número. */
  vigentes(codigoReceta: string | undefined): Promise<LicenciaParaReporte[]>;
  /** Vigentes con un certificado que vence entre `desde` y `hasta`, por vencimiento ascendente. */
  itsePorVencer(
    desde: Fecha,
    hasta: Fecha,
    codigoReceta: string | undefined,
  ): Promise<LicenciaParaReporte[]>;
}
