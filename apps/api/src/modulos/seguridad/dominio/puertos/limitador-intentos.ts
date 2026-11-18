import type { Correo } from '../correo';

export interface EstadoLimite {
  readonly bloqueado: boolean;
  /** Segundos hasta que se pueda reintentar (0 si no está bloqueado). */
  readonly segundosRestantes: number;
}

/** No se pueden consultar los contadores (Redis no responde): el inicio de sesión falla cerrado. */
export class ErrorLimitadorNoDisponible extends Error {
  constructor() {
    super('Los límites de intentos no están disponibles');
    this.name = 'ErrorLimitadorNoDisponible';
  }
}

/**
 * Contadores compartidos por todas las instancias (FR-006 a FR-009, FR-002a; research.md §R-08).
 * Si los contadores no están disponibles, los métodos lanzan `ErrorLimitadorNoDisponible`.
 */
export interface LimitadorIntentos {
  /** 5 fallos en 15 minutos para el correo (exista o no) o para el origen. */
  consultarFallos(correo: Correo | null, ip: string): Promise<EstadoLimite>;
  registrarFallo(correo: Correo | null, ip: string): Promise<void>;
  /** 3 códigos enviados al usuario en 15 minutos. */
  consultarEnvios(usuarioId: string): Promise<EstadoLimite>;
  registrarEnvio(usuarioId: string): Promise<void>;
}
