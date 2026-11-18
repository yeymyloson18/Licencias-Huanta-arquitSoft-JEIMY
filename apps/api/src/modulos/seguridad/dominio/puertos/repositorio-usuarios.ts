import type { Correo } from '../correo';
import type { Rol } from '../rol';
import type { Usuario } from '../usuario';

/** Estado actual de seguridad de un usuario y de una de sus sesiones (research.md §R-07). */
export interface EstadoSeguridadUsuario {
  readonly activo: boolean;
  readonly versionSeguridad: number;
  readonly roles: readonly Rol[];
  readonly debeCambiarClave: boolean;
  /** Si la sesión indicada tiene `revocada_en` (o no existe). */
  readonly sesionRevocada: boolean;
}

/** Persistencia de usuarios y de su historial de roles (esquema `seguridad`). */
export interface RepositorioUsuarios {
  /** Guarda un usuario nuevo con sus asignaciones de rol. */
  crear(usuario: Usuario): Promise<void>;
  obtenerPorId(id: string): Promise<Usuario | null>;
  /** Busca por igualdad exacta del correo normalizado (el adaptador usa su HMAC, MD3). */
  obtenerPorCorreo(correo: Correo): Promise<Usuario | null>;
  /** Guarda los cambios del usuario: datos, asignaciones retiradas y nuevas, y la versión. */
  guardar(usuario: Usuario): Promise<void>;
  /** Lectura liviana para el control de permisos cuando la caché no basta; `null` si no existe. */
  obtenerEstadoSeguridad(
    usuarioId: string,
    sesionId: string,
  ): Promise<EstadoSeguridadUsuario | null>;
}
