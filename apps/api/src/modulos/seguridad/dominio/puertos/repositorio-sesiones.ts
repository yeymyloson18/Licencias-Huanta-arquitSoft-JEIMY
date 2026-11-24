import type { EventoAuditoria } from '../evento-auditoria';
import type { Sesion } from '../sesion';

/** Eventos de auditoría que se arman con los ids de las sesiones revocadas (p. ej. cuántas). */
export type AuditoriaDeRevocacion = (revocadas: readonly string[]) => readonly EventoAuditoria[];

/** Persistencia de las sesiones del personal (`seguridad.sesion`). */
export interface RepositorioSesiones {
  /** Crea la sesión; la auditoría (p. ej. `INGRESO_CORRECTO`) va en la misma transacción. */
  crear(sesion: Sesion, auditoria?: readonly EventoAuditoria[]): Promise<void>;
  /** `null` si no existe o el id no es válido. */
  obtenerPorId(id: string): Promise<Sesion | null>;
  /** Guarda la rotación, la última actividad y la revocación. */
  guardar(sesion: Sesion, auditoria?: readonly EventoAuditoria[]): Promise<void>;
  /** Revoca todas las sesiones vigentes del usuario y devuelve sus ids. */
  revocarTodasDelUsuario(
    usuarioId: string,
    ahora: Date,
    auditoria?: AuditoriaDeRevocacion,
  ): Promise<string[]>;
  /** Revoca las sesiones vigentes del usuario salvo `sesionId` y devuelve sus ids. */
  revocarTodasMenos(usuarioId: string, sesionId: string, ahora: Date): Promise<string[]>;
}
