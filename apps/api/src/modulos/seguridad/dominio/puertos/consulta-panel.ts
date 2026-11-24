import type { Rol } from '../rol';
import type { PersonaAuditoria } from './repositorio-auditoria';

/** Conteos de usuarios y sesiones para el panel (research §R-06 de la 009). */
export interface CifrasUsuarios {
  readonly activos: number;
  readonly inactivos: number;
  /** Usuarios activos con cada rol vigente; los roles sin usuarios pueden faltar. */
  readonly porRol: Readonly<Partial<Record<Rol, number>>>;
  /** Sesiones no revocadas, dentro de las 8 horas y renovadas en los últimos 30 minutos. */
  readonly sesionesAbiertas: number;
}

/** Una asignación de rol del historial (`seguridad.usuario_rol`), con los nombres. */
export interface AsignacionHistorial {
  readonly rol: Rol;
  readonly asignadoPor: PersonaAuditoria;
  readonly asignadoEn: Date;
  readonly retiradoPor: PersonaAuditoria | null;
  readonly retiradoEn: Date | null;
}

/** Lecturas del panel y de la ficha que no son de la auditoría. */
export interface ConsultaPanel {
  cifrasUsuarios(ahora: Date): Promise<CifrasUsuarios>;
  /** Cuántos de esos HMAC de correo (hexadecimal) son cuentas que existen. */
  contarCuentasExistentes(correosHmac: readonly string[]): Promise<number>;
  /** Sesiones abiertas de un usuario (misma regla que `cifrasUsuarios`). */
  sesionesAbiertasDe(usuarioId: string, ahora: Date): Promise<number>;
  /** Todas las asignaciones del usuario, vigentes y retiradas, de la más antigua a la más nueva. */
  historialRoles(usuarioId: string): Promise<readonly AsignacionHistorial[]>;
}
