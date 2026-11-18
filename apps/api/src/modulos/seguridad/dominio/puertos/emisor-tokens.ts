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
