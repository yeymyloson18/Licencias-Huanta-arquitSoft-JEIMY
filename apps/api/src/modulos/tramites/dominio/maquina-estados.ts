import { ErrorDominio } from './error-dominio';
import type { EstadoExpediente } from './estado-publico';

// Máquina de estados del expediente (research §R-03 de la 005). Es la única fuente de las
// transiciones permitidas; las rutas B (ITSE previa) y la emisión de licencias se agregan en la 006.

export type AccionExpediente =
  | 'INICIAR_EVALUACION'
  | 'CONFIRMAR_RIESGO'
  | 'OBSERVAR'
  | 'SUBSANAR'
  | 'DENEGAR'
  | 'REGISTRAR_PAGO'
  | 'APROBAR';

export type Ruta = 'A' | 'B' | 'C';

interface Transicion {
  readonly desde: EstadoExpediente;
  readonly hacia: EstadoExpediente;
  readonly rutas: readonly Ruta[];
}

const TODAS: readonly Ruta[] = ['A', 'B', 'C'];

const TRANSICIONES: Readonly<Record<AccionExpediente, Transicion>> = {
  INICIAR_EVALUACION: { desde: 'REGISTRADO', hacia: 'EN_EVALUACION', rutas: TODAS },
  CONFIRMAR_RIESGO: { desde: 'EN_EVALUACION', hacia: 'PENDIENTE_PAGO', rutas: TODAS },
  OBSERVAR: { desde: 'EN_EVALUACION', hacia: 'OBSERVADO', rutas: TODAS },
  SUBSANAR: { desde: 'OBSERVADO', hacia: 'EN_EVALUACION', rutas: TODAS },
  DENEGAR: { desde: 'EN_EVALUACION', hacia: 'DENEGADO', rutas: TODAS },
  REGISTRAR_PAGO: { desde: 'PENDIENTE_PAGO', hacia: 'PAGADO', rutas: TODAS },
  APROBAR: { desde: 'PAGADO', hacia: 'APROBADO', rutas: ['A', 'C'] },
};

/** La acción no corresponde al estado (o a la ruta) del expediente: 409 con el estado actual. */
export class ErrorTransicionInvalida extends ErrorDominio {
  constructor(
    readonly estadoActual: EstadoExpediente,
    readonly accion: AccionExpediente,
  ) {
    super(`La acción ${accion} no corresponde a un expediente ${estadoActual}`);
    this.name = 'ErrorTransicionInvalida';
  }
}

/** El estado que toma el expediente con esa acción; lanza si no está permitida. */
export const siguienteEstado = (
  estadoActual: EstadoExpediente,
  ruta: Ruta,
  accion: AccionExpediente,
): EstadoExpediente => {
  const transicion = TRANSICIONES[accion];
  if (transicion.desde !== estadoActual || !transicion.rutas.includes(ruta)) {
    throw new ErrorTransicionInvalida(estadoActual, accion);
  }
  return transicion.hacia;
};

/** El estado desde el que se permite la acción (para el `UPDATE` condicional). */
export const estadoRequerido = (accion: AccionExpediente): EstadoExpediente =>
  TRANSICIONES[accion].desde;

/**
 * Al confirmar el riesgo, una licencia sin tasa (bodega, 0.00) no genera esquela y el expediente pasa
 * directamente a PAGADO (aclaración de la 005).
 */
export const estadoTrasConfirmarRiesgo = (tasa: number): EstadoExpediente =>
  tasa > 0 ? 'PENDIENTE_PAGO' : 'PAGADO';
