import type {
  HuellasIdentidad,
  ResultadoServicioRegistrado,
  VerificacionIdentidad,
} from '../verificacion-identidad';

/**
 * Persistencia de las verificaciones de identidad del administrado (`seguridad.verificacion_identidad`
 * y su código en `seguridad.codigo_otp` con propósito IDENTIDAD_ADMINISTRADO). Solo huellas.
 */
export interface RepositorioVerificaciones {
  /** Guarda una verificación que el servicio confirmó, con su código. */
  crear(verificacion: VerificacionIdentidad): Promise<void>;
  /** Deja constancia de un intento que el servicio no confirmó (sin código). */
  registrarRechazo(
    id: string,
    huellas: HuellasIdentidad,
    resultado: Exclude<ResultadoServicioRegistrado, 'VALIDO'>,
    en: Date,
  ): Promise<void>;
  /** `null` si no existe o el id no es válido. */
  obtenerPorId(id: string): Promise<VerificacionIdentidad | null>;
  /** Guarda los intentos, el vencimiento y la confirmación del código. */
  guardar(verificacion: VerificacionIdentidad): Promise<void>;
  /** Vence los códigos pendientes del mismo documento: al pedir otro, solo vale el último. */
  vencerPendientesDelDocumento(documentoHmac: Uint8Array, ahora: Date): Promise<void>;
}
