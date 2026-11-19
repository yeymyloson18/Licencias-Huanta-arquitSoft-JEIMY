import type { Canal, Expediente } from '../expediente';
import type { NumeroExpediente } from '../numero-expediente';

/** Lo que ve el solicitante al terminar (esquema `ExpedienteRegistrado`, FR-021). */
export interface ExpedienteRegistrado {
  readonly numero: string;
  readonly estado: string;
  readonly ruta: 'A' | 'B' | 'C';
  readonly codigoReceta: string;
  readonly nombreLicencia: string;
  readonly canal: Canal;
  readonly presentadoEn: Date;
}

export interface PresentacionExistente {
  readonly huellaCuerpo: string;
  readonly registrado: ExpedienteRegistrado;
}

export type ResultadoRegistro =
  | { readonly tipo: 'CREADO'; readonly registrado: ExpedienteRegistrado }
  /** La misma `Idempotency-Key` ya se registró (otro envío simultáneo ganó). */
  | { readonly tipo: 'CLAVE_EXISTENTE' }
  /** El permiso de identidad ya se usó en otro expediente (aclaración 2). */
  | { readonly tipo: 'PERMISO_USADO' }
  /** Algún documento temporal ya no está (se usó o se descartó entre la revisión y el registro). */
  | { readonly tipo: 'DOCUMENTOS_NO_DISPONIBLES' };

/**
 * Puerto: presentación atómica (research §R-10 de la 004). `registrar` toma el número de la
 * secuencia, arma el expediente con `armar`, y en una sola transacción guarda el expediente, sus
 * documentos (los quita de los temporales), el historial, la auditoría, el evento
 * `SolicitudPresentada` y la clave de idempotencia. Si algo falla, no queda nada.
 */
export interface UnidadDeTrabajoTramites {
  buscarPorClave(claveIdempotencia: string): Promise<PresentacionExistente | null>;
  registrar(solicitud: {
    readonly armar: (numero: NumeroExpediente) => Expediente;
    readonly anio: number;
    readonly claveIdempotencia: string;
    readonly huellaCuerpo: string;
  }): Promise<ResultadoRegistro>;
}
