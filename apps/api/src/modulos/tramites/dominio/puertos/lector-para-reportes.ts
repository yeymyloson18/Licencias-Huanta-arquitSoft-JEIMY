import type { EstadoExpediente } from '../estado-publico';

/** Estados con decisión final: la atención de la Municipalidad termina al entrar al primero (007). */
export const ESTADOS_DECISION_FINAL: readonly EstadoExpediente[] = [
  'APROBADO',
  'LICENCIA_EMITIDA',
  'LICENCIA_PROVISIONAL',
  'DENEGADO',
];

/** Estados "en trámite" del reporte (007): todavía sin decisión final. */
export const ESTADOS_EN_TRAMITE: readonly EstadoExpediente[] = [
  'REGISTRADO',
  'EN_EVALUACION',
  'OBSERVADO',
  'PENDIENTE_PAGO',
  'PAGADO',
  'EN_INSPECCION',
  'APROBADO',
];

/** Expediente cuya atención terminó, con su historial de estados (sin datos personales). */
export interface ExpedienteTerminado {
  readonly numero: string;
  readonly codigoReceta: string;
  readonly presentadoEn: Date;
  readonly terminadoEn: Date;
  readonly historial: readonly { readonly estadoNuevo: string; readonly ocurridoEn: Date }[];
}

/** Expediente en trámite para el reporte; el nombre se usa solo para abreviarlo dentro del módulo. */
export interface ExpedienteEnTramite {
  readonly numero: string;
  readonly codigoReceta: string;
  readonly razonSocial: string | null;
  readonly nombreTitular: string;
  readonly giro: string;
  readonly zona: string;
  readonly estado: string;
  readonly presentadoEn: Date;
}

/**
 * Puerto: lecturas para el tablero y el reporte de la jefatura (007). Los instantes son límites
 * `[desde, hasta)` ya convertidos desde días de Lima.
 */
export interface LectorParaReportes {
  conteoPorEstado(desde: Date, hasta: Date): Promise<Readonly<Record<string, number>>>;
  /** Expedientes cuya primera decisión final cae en `[desde, hasta)`. */
  terminados(desde: Date, hasta: Date): Promise<ExpedienteTerminado[]>;
  enTramite(codigoReceta: string | undefined): Promise<ExpedienteEnTramite[]>;
}
