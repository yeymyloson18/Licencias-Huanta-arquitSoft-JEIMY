/** Identidad tal como llega en la solicitud (esquema `SolicitudVerificacionIdentidad`). */
export interface IdentidadSolicitud {
  readonly tipoDocumento: 'DNI' | 'CE';
  readonly numeroDocumento: string;
  readonly fechaEmision?: string;
  readonly ruc: string;
  readonly celular: string;
  readonly representante?: {
    readonly tipoDocumento: 'DNI' | 'CE';
    readonly numeroDocumento: string;
    readonly fechaEmision?: string;
  };
}

export type ResultadoIdentidad =
  | { readonly tipo: 'CONFIRMADA' }
  | { readonly tipo: 'NO_CONFIRMADA' }
  | { readonly tipo: 'DATOS_INVALIDOS'; readonly campos: readonly string[] };

/** Mesa de partes: el titular se comprueba con el servicio de identificación, sin código. */
export type ResultadoIdentidadPresencial =
  | { readonly tipo: 'VALIDA' }
  | { readonly tipo: 'NO_COINCIDE' }
  | { readonly tipo: 'NO_DISPONIBLE' }
  | { readonly tipo: 'DATOS_INVALIDOS'; readonly campos: readonly string[] };

/**
 * Puerto: comprueba la identidad del solicitante (lo implementa un adaptador de la fachada de
 * Seguridad). En línea compara con la identidad confirmada con el código (research §R-05).
 */
export interface VerificadorIdentidad {
  confirmarEnLinea(
    verificacionId: string,
    identidad: IdentidadSolicitud,
  ): Promise<ResultadoIdentidad>;
  verificarPresencial(identidad: IdentidadSolicitud): Promise<ResultadoIdentidadPresencial>;
}
