export interface EstadoSeguridadEnCache {
  /** Versión publicada o `null` si no está en la caché. */
  readonly version: number | null;
  readonly sesionRevocada: boolean;
}

/**
 * Copia en caché de la versión de seguridad de cada usuario y de las sesiones revocadas, para
 * revocar al instante sin consultar PostgreSQL en cada petición (FR-004, FR-011, FR-015;
 * research.md §R-07).
 */
export interface AlmacenVersionSeguridad {
  /** Devuelve `null` si la caché no responde ("desconocido"). */
  leerEstado(usuarioId: string, sesionId: string): Promise<EstadoSeguridadEnCache | null>;
  publicarVersion(usuarioId: string, version: number): Promise<void>;
  marcarSesionesRevocadas(sesionIds: readonly string[]): Promise<void>;
}
