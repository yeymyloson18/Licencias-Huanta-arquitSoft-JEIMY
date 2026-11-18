import type { Correo } from '../correo';
import type { Usuario } from '../usuario';

/** Persistencia de usuarios y de su historial de roles (esquema `seguridad`). */
export interface RepositorioUsuarios {
  /** Guarda un usuario nuevo con sus asignaciones de rol. */
  crear(usuario: Usuario): Promise<void>;
  obtenerPorId(id: string): Promise<Usuario | null>;
  /** Busca por igualdad exacta del correo normalizado (el adaptador usa su HMAC, MD3). */
  obtenerPorCorreo(correo: Correo): Promise<Usuario | null>;
  /** Guarda los cambios del usuario: datos, asignaciones retiradas y nuevas, y la versión. */
  guardar(usuario: Usuario): Promise<void>;
}
