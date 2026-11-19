import { ErrorDominio } from './error-dominio';

/** Un campo de la solicitud con problema; el mensaje nunca repite el valor recibido (FR-035). */
export interface ErrorCampoSolicitud {
  readonly campo: string;
  readonly mensaje: string;
}

/** La solicitud no cumple las reglas: trae todos los errores a la vez (FR-012). */
export class ErrorValidacionSolicitud extends ErrorDominio {
  constructor(readonly errores: readonly ErrorCampoSolicitud[]) {
    super('La solicitud no cumple las reglas');
    this.name = 'ErrorValidacionSolicitud';
  }
}
