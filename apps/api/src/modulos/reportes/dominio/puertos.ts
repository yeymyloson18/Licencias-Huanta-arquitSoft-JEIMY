import type { Fecha } from '../../../compartido/dominio/fecha-lima';
import type { Atencion, PagoEnCaja, PlazoDeReceta } from './tablero';

// Puertos del módulo Reportes (007). Los adaptadores están sobre las fachadas de los otros módulos:
// reportes nunca consulta sus esquemas (FR-013).

export interface Reloj {
  ahora(): Date;
}

/** Fila del reporte con el titular público (nunca el nombre completo ni datos de contacto). */
export interface FilaReporte {
  readonly numero: string;
  readonly codigoReceta: string;
  readonly titular: string;
  readonly giro: string;
  readonly zona: string;
  readonly estado: string;
  readonly fecha: Fecha;
}

export interface FuenteTramites {
  conteoPorEstado(desde: Fecha, hasta: Fecha): Promise<Readonly<Record<string, number>>>;
  atencionesTerminadas(desde: Fecha, hasta: Fecha): Promise<Atencion[]>;
  expedientesEnTramite(codigoReceta?: string): Promise<FilaReporte[]>;
}

export interface FuentePagos {
  pagosRegistrados(desde: Fecha, hasta: Fecha): Promise<PagoEnCaja[]>;
}

export interface FuenteLicencias {
  vigentes(codigoReceta?: string): Promise<FilaReporte[]>;
  itsePorVencer(codigoReceta?: string): Promise<FilaReporte[]>;
}

export interface FuenteCatalogo {
  plazosPorReceta(): Promise<PlazoDeReceta[]>;
}

export interface FuenteFeriados {
  feriadosEntre(desde: Fecha, hasta: Fecha): Promise<ReadonlySet<Fecha>>;
}

/** Caché de pocos minutos (criterio 11). Puede fallar: quien la usa sigue sin ella. */
export interface CacheReportes {
  leer(clave: string): Promise<string | null>;
  guardar(clave: string, valor: string, segundos: number): Promise<void>;
}
