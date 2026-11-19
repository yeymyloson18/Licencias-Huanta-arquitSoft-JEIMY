import { ErrorDominio } from './error-dominio';

/** Un campo con problema: nombre del campo del contrato y mensaje sin el valor recibido. */
export interface ErrorCampoReceta {
  /** Por ejemplo `tasa`, `requisitos` o `requisitos[2].descripcion`. */
  readonly campo: string;
  readonly mensaje: string;
}

/**
 * El cambio dejaría la receta inválida (FR-019). Trae **todos** los errores a la vez. Los mensajes
 * no repiten lo recibido ni contienen datos personales (FR-026).
 */
export class ErrorValidacionReceta extends ErrorDominio {
  constructor(readonly errores: readonly ErrorCampoReceta[]) {
    super('El cambio dejaría la receta inválida');
    this.name = 'ErrorValidacionReceta';
  }
}
