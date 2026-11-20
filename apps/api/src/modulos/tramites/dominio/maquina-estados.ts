import { ErrorDominio } from './error-dominio';
import type { EstadoExpediente } from './estado-publico';

// Máquina de estados del expediente (research §R-03 de la 005). Es la única fuente de las
// transiciones permitidas. La 006 agrega las transiciones del sistema por ruta (inspección previa,
// emisión de la licencia, ITSE posterior y fiscalización; data-model §1 de la 006).

export type AccionExpediente =
  | 'INICIAR_EVALUACION'
  | 'CONFIRMAR_RIESGO'
  | 'OBSERVAR'
  | 'SUBSANAR'
  | 'DENEGAR'
  | 'REGISTRAR_PAGO'
  | 'APROBAR'
  // Del sistema (006): las dispara la cola de eventos.
  | 'INICIAR_INSPECCION_PREVIA'
  | 'EMITIR_LICENCIA'
  | 'EMITIR_LICENCIA_PROVISIONAL'
  | 'ESPERAR_ITSE_POSTERIOR'
  | 'FINALIZAR'
  | 'DENEGAR_POR_ITSE'
  | 'DERIVAR_A_FISCALIZACION';

export type Ruta = 'A' | 'B' | 'C';

interface Transicion {
  readonly desde: EstadoExpediente;
  readonly hacia: EstadoExpediente;
  readonly rutas: readonly Ruta[];
}

const TODAS: readonly Ruta[] = ['A', 'B', 'C'];

/** Cada acción puede partir de un estado distinto según la ruta (por ejemplo, EMITIR_LICENCIA). */
const TRANSICIONES: Readonly<Record<AccionExpediente, readonly Transicion[]>> = {
  INICIAR_EVALUACION: [{ desde: 'REGISTRADO', hacia: 'EN_EVALUACION', rutas: TODAS }],
  CONFIRMAR_RIESGO: [{ desde: 'EN_EVALUACION', hacia: 'PENDIENTE_PAGO', rutas: TODAS }],
  OBSERVAR: [{ desde: 'EN_EVALUACION', hacia: 'OBSERVADO', rutas: TODAS }],
  SUBSANAR: [{ desde: 'OBSERVADO', hacia: 'EN_EVALUACION', rutas: TODAS }],
  DENEGAR: [{ desde: 'EN_EVALUACION', hacia: 'DENEGADO', rutas: TODAS }],
  REGISTRAR_PAGO: [{ desde: 'PENDIENTE_PAGO', hacia: 'PAGADO', rutas: TODAS }],
  APROBAR: [{ desde: 'PAGADO', hacia: 'APROBADO', rutas: ['A', 'C'] }],
  INICIAR_INSPECCION_PREVIA: [{ desde: 'PAGADO', hacia: 'EN_INSPECCION', rutas: ['B'] }],
  EMITIR_LICENCIA: [
    { desde: 'APROBADO', hacia: 'LICENCIA_EMITIDA', rutas: ['A'] },
    { desde: 'EN_INSPECCION', hacia: 'LICENCIA_EMITIDA', rutas: ['B'] },
  ],
  EMITIR_LICENCIA_PROVISIONAL: [{ desde: 'APROBADO', hacia: 'LICENCIA_PROVISIONAL', rutas: ['C'] }],
  ESPERAR_ITSE_POSTERIOR: [
    { desde: 'LICENCIA_EMITIDA', hacia: 'ITSE_POSTERIOR_PENDIENTE', rutas: ['A'] },
  ],
  FINALIZAR: [
    { desde: 'LICENCIA_EMITIDA', hacia: 'FINALIZADO', rutas: ['B'] },
    { desde: 'ITSE_POSTERIOR_PENDIENTE', hacia: 'FINALIZADO', rutas: ['A'] },
  ],
  DENEGAR_POR_ITSE: [{ desde: 'EN_INSPECCION', hacia: 'DENEGADO', rutas: ['B'] }],
  DERIVAR_A_FISCALIZACION: [
    { desde: 'ITSE_POSTERIOR_PENDIENTE', hacia: 'DERIVADO_A_FISCALIZACION', rutas: ['A'] },
    { desde: 'LICENCIA_PROVISIONAL', hacia: 'DERIVADO_A_FISCALIZACION', rutas: ['C'] },
  ],
};

const transicionDe = (accion: AccionExpediente, ruta: Ruta, desde?: EstadoExpediente) =>
  TRANSICIONES[accion].find(
    (transicion) =>
      transicion.rutas.includes(ruta) && (desde === undefined || transicion.desde === desde),
  );

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
  const transicion = transicionDe(accion, ruta, estadoActual);
  if (transicion === undefined) {
    throw new ErrorTransicionInvalida(estadoActual, accion);
  }
  return transicion.hacia;
};

/** El estado desde el que se permite la acción en esa ruta (para el `UPDATE` condicional). */
export const estadoRequerido = (accion: AccionExpediente, ruta: Ruta): EstadoExpediente | null =>
  transicionDe(accion, ruta)?.desde ?? null;

/**
 * Al confirmar el riesgo, una licencia sin tasa (bodega, 0.00) no genera esquela y el expediente pasa
 * directamente a PAGADO (aclaración de la 005).
 */
export const estadoTrasConfirmarRiesgo = (tasa: number): EstadoExpediente =>
  tasa > 0 ? 'PENDIENTE_PAGO' : 'PAGADO';
