import type { EstadoExpediente } from '../estado-publico';
import type { Ruta } from '../maquina-estados';
import type { NivelRiesgo } from './repositorio-expedientes';

/** Lo que el evaluador necesita leer del expediente para decidir (005). Sin datos personales. */
export interface ExpedienteParaDecidir {
  readonly id: string;
  readonly numero: string;
  readonly estado: EstadoExpediente;
  readonly ruta: Ruta;
  readonly codigoReceta: string;
  readonly version: number;
  /** Ya tiene una observación (el TUPA permite una sola). */
  readonly yaObservado: boolean;
}

export type AccionAuditoriaTramites =
  | 'INICIAR_EVALUACION'
  | 'CONFIRMAR_RIESGO'
  | 'CORREGIR_RIESGO'
  | 'OBSERVAR'
  | 'DENEGAR'
  | 'APROBAR'
  | 'SUBSANAR';

export interface EventoParaPublicar {
  readonly tipo: string;
  /** Solo datos no personales (número, códigos, montos, estados). */
  readonly datos: Readonly<Record<string, string | number>>;
}

/** Una decisión ya validada por el dominio, lista para guardarse en una sola transacción. */
export interface Decision {
  readonly expedienteId: string;
  readonly numero: string;
  readonly estadoEsperado: EstadoExpediente;
  readonly versionEsperada: number;
  readonly estadoNuevo: EstadoExpediente;
  /** `null` = el sistema (por ejemplo, el paso a PAGADO al consumir `PagoRegistrado`). */
  readonly usuarioId: string | null;
  readonly comentario: string | null;
  /** `null` = sin auditoría de trámites (el pago ya tiene la suya en `pagos.auditoria`). */
  readonly auditoria: {
    readonly accion: AccionAuditoriaTramites;
    readonly detalle: Readonly<Record<string, string>> | null;
  } | null;
  readonly cambios?: {
    readonly codigoReceta?: string;
    readonly ruta?: Ruta;
    readonly nivelRiesgoPropuesto?: NivelRiesgo | null;
    readonly nivelRiesgoConfirmado?: NivelRiesgo | null;
    readonly evaluadorId?: string;
  };
  readonly observacion?: { readonly descripcion: string; readonly plazoSubsanarEn: Date | null };
  readonly eventos: readonly EventoParaPublicar[];
  readonly en: Date;
}

/**
 * Puerto: guarda las decisiones del evaluador (research §R-05 de la 005). `aplicar` actualiza el
 * expediente solo si sigue en `estadoEsperado` y con `versionEsperada`; en la misma transacción
 * escribe el historial, la auditoría, la observación (si hay) y los eventos. `false` si otro cambio
 * ganó la carrera (no escribe nada).
 */
export interface RepositorioDecisiones {
  obtenerParaDecidir(numero: string): Promise<ExpedienteParaDecidir | null>;
  aplicar(decision: Decision): Promise<boolean>;
}
