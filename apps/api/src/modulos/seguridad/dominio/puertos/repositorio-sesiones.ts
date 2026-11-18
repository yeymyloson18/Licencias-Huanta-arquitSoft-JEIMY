import type { Sesion } from '../sesion';

/** Persistencia de las sesiones del personal (`seguridad.sesion`). */
export interface RepositorioSesiones {
  crear(sesion: Sesion): Promise<void>;
  /** `null` si no existe o el id no es válido. */
  obtenerPorId(id: string): Promise<Sesion | null>;
  /** Guarda la rotación, la última actividad y la revocación. */
  guardar(sesion: Sesion): Promise<void>;
  /** Revoca todas las sesiones vigentes del usuario y devuelve sus ids. */
  revocarTodasDelUsuario(usuarioId: string, ahora: Date): Promise<string[]>;
  /** Revoca las sesiones vigentes del usuario salvo `sesionId` y devuelve sus ids. */
  revocarTodasMenos(usuarioId: string, sesionId: string, ahora: Date): Promise<string[]>;
}
