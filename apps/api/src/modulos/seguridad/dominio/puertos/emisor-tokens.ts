import type { Rol } from '../rol';

/** Datos del token de acceso del personal. Nunca incluye datos personales (principio VII). */
export interface ReclamosAcceso {
  /** Id del usuario. */
  readonly sub: string;
  /** Id de la sesión. */
  readonly sid: string;
  readonly roles: readonly Rol[];
  /** Versión de seguridad del usuario al emitir el token (research.md §R-07). */
  readonly vs: number;
  /** Debe cambiar la clave (FR-022). */
  readonly dcc: boolean;
}

/** Firma y verificación del token de acceso de 15 minutos (research.md §R-05). */
export interface EmisorTokens {
  readonly segundosDeVida: number;
  firmarAcceso(reclamos: ReclamosAcceso): Promise<string>;
  /** Devuelve los reclamos o `null` si el token es inválido, está alterado o venció. */
  verificarAcceso(token: string): Promise<ReclamosAcceso | null>;
}

/**
 * Token de identidad del administrado (research §R-03 de la 004): JWT de 30 minutos con audiencia
 * propia y `jti` = id de la verificación, sin datos personales. No sirve como token del personal ni
 * al revés.
 */
export interface EmisorTokensIdentidad {
  readonly segundosDeVidaIdentidad: number;
  firmarIdentidad(verificacionId: string): Promise<string>;
  /** Devuelve el id de la verificación o `null` si el token es inválido, de otra audiencia o venció. */
  verificarIdentidad(token: string): Promise<string | null>;
}

/**
 * `tokenConsulta` (research §R-08 de la 005): 15 minutos, audiencia propia y el número de expediente
 * como sujeto. Sirve solo para leer ese expediente (por ahora, descargar su esquela).
 */
export interface EmisorTokensConsulta {
  readonly segundosDeVidaConsulta: number;
  firmarConsulta(numeroExpediente: string): Promise<string>;
  /** Devuelve el número de expediente o `null` si el token es inválido, de otra audiencia o venció. */
  verificarConsulta(token: string): Promise<string | null>;
}
