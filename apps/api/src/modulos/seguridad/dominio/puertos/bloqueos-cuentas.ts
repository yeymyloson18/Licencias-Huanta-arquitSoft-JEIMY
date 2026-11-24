import type { Correo } from '../correo';

/** Bloqueos vigentes por intentos fallidos (research §R-05 de la 009). */
export interface BloqueosActuales {
  /** HMAC (hexadecimal) de los correos bloqueados; existan o no como cuentas. Nunca el correo. */
  readonly correosHmac: readonly string[];
  /** Orígenes bloqueados (sin revelar cuáles). */
  readonly origenes: number;
}

export interface EstadoBloqueo {
  readonly bloqueada: boolean;
  /** Hasta cuándo dura el bloqueo; `null` si no está bloqueada. */
  readonly hasta: Date | null;
}

/**
 * Lectura y borrado de los contadores de intentos fallidos del ingreso (los mismos del limitador de
 * la 002), identificados por el HMAC del correo. Si el servicio no responde, las lecturas devuelven
 * `null` (no se inventan cifras) y el borrado lanza `ErrorLimitadorNoDisponible`.
 */
export interface BloqueosCuentas {
  bloqueosActuales(): Promise<BloqueosActuales | null>;
  estadoDeCuenta(correo: Correo, ahora: Date): Promise<EstadoBloqueo | null>;
  /** Borra solo el contador de la cuenta, nunca el del origen (aclaración del 2026-11-23). */
  desbloquear(correo: Correo): Promise<void>;
}
