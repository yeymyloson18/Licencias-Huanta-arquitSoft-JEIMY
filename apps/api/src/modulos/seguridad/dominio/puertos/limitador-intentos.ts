import type { Correo } from '../correo';

export interface ResultadoReserva {
  /** `false` si el intento supera el límite: no se debe verificar nada. */
  readonly permitido: boolean;
  /** Segundos hasta que se pueda reintentar (0 si está permitido). */
  readonly segundosRestantes: number;
}

/** No se pueden usar los contadores (Redis no responde): el inicio de sesión falla cerrado. */
export class ErrorLimitadorNoDisponible extends Error {
  constructor() {
    super('Los límites de intentos no están disponibles');
    this.name = 'ErrorLimitadorNoDisponible';
  }
}

/**
 * Contadores compartidos por todas las instancias (FR-006 a FR-009, FR-002a; research.md §R-08).
 *
 * Cada intento se RESERVA de forma atómica antes de verificar nada (incrementar y leer el valor en
 * una sola operación): así, aunque lleguen muchos intentos a la vez, como máximo `límite` de ellos
 * llegan a verificar la clave o el código. Si el intento resulta válido se LIBERA (devuelve la
 * reserva), de modo que solo los fallos quedan contados.
 *
 * Si los contadores no están disponibles, los métodos lanzan `ErrorLimitadorNoDisponible`.
 */
export interface LimitadorIntentos {
  /** Reserva un intento de clave o código: 5 por correo (exista o no) y 5 por origen en 15 min. */
  reservarIntento(correo: Correo | null, ip: string): Promise<ResultadoReserva>;
  /** Devuelve un intento reservado que resultó correcto. */
  liberarIntento(correo: Correo | null, ip: string): Promise<void>;
  /** Reserva el envío de un código: 3 por usuario en 15 minutos. */
  reservarEnvio(usuarioId: string): Promise<ResultadoReserva>;
  /** Devuelve un envío reservado que no se pudo hacer (falló el proveedor). */
  liberarEnvio(usuarioId: string): Promise<void>;
}

/**
 * Límites de la verificación de identidad del administrado (FR-006 de la 004, research §R-07): el
 * mismo algoritmo atómico y que falla cerrado que el inicio de sesión, con contadores propios. Las
 * huellas llegan en hexadecimal; nunca el documento ni el celular en claro.
 */
export interface LimitadorIntentosIdentidad {
  /** 5 intentos por documento (exista o no) y 5 por origen en 15 minutos. */
  reservarIntentoIdentidad(documentoHmac: string | null, ip: string): Promise<ResultadoReserva>;
  liberarIntentoIdentidad(documentoHmac: string | null, ip: string): Promise<void>;
  /** 3 envíos de código por celular en 15 minutos. */
  reservarEnvioIdentidad(celularHmac: string): Promise<ResultadoReserva>;
  liberarEnvioIdentidad(celularHmac: string): Promise<void>;
}
