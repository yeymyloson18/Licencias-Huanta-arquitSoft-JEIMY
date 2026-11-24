import type { Correo } from '../correo';
import type { EventoAuditoria } from '../evento-auditoria';
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

export interface CriterioBusquedaUsuarios {
  readonly activo?: boolean;
  /** Fragmento del nombre (sin distinguir mayúsculas). */
  readonly texto?: string;
  /** Si el texto es un correo completo: coincidencia exacta por su HMAC (MD3). */
  readonly correo?: Correo;
  readonly pagina: number;
  readonly porPagina: number;
}

export interface PaginaUsuarios {
  readonly usuarios: readonly Usuario[];
  readonly total: number;
}

/**
 * Cambio sobre un usuario que se aplica dentro de la transacción de `modificar`. Recibe los ids de
 * los administradores activos leídos en esa misma transacción; puede lanzar un error del dominio
 * para cancelar el cambio (nada se guarda). Devuelve los eventos de auditoría que describen el
 * cambio, que se guardan en la misma transacción (research §R-03 de la 009).
 */
export type CambioUsuario = (
  usuario: Usuario,
  administradoresActivos: readonly string[],
) => readonly EventoAuditoria[] | void;

/** Persistencia de usuarios y de su historial de roles (esquema `seguridad`). */
export interface RepositorioUsuarios {
  /** Guarda un usuario nuevo con sus asignaciones de rol. */
  crear(usuario: Usuario, auditoria?: readonly EventoAuditoria[]): Promise<void>;
  obtenerPorId(id: string): Promise<Usuario | null>;
  /** Busca por igualdad exacta del correo normalizado (el adaptador usa su HMAC, MD3). */
  obtenerPorCorreo(correo: Correo): Promise<Usuario | null>;
  /** Guarda los cambios del usuario: datos, asignaciones retiradas y nuevas, y la versión. */
  guardar(usuario: Usuario, auditoria?: readonly EventoAuditoria[]): Promise<void>;
  /** Página de usuarios ordenada por nombre (FR-016). */
  buscar(criterio: CriterioBusquedaUsuarios): Promise<PaginaUsuarios>;
  /**
   * Lee el usuario y los administradores activos, aplica `cambio` y guarda, todo en UNA transacción
   * que serializa los cambios que pueden afectar a los administradores (FR-020, research.md §R-09).
   * Devuelve el usuario guardado, o `null` si no existe.
   */
  modificar(usuarioId: string, cambio: CambioUsuario): Promise<Usuario | null>;
  /** Si hay al menos un usuario activo con el rol ADMINISTRADOR vigente. */
  hayAdministradorActivo(): Promise<boolean>;
  /**
   * Crea `usuario` solo si no hay ningún administrador activo, dentro de una transacción que
   * serializa las creaciones simultáneas (FR-024). Devuelve `false` si ya había uno.
   */
  crearSiNoHayAdministradores(usuario: Usuario): Promise<boolean>;
  /** Lectura liviana para el control de permisos cuando la caché no basta; `null` si no existe. */
  obtenerEstadoSeguridad(
    usuarioId: string,
    sesionId: string,
  ): Promise<EstadoSeguridadUsuario | null>;
}
