import { eventoGestion } from '../dominio/evento-auditoria';
import type { AlmacenVersionSeguridad } from '../dominio/puertos/almacen-version-seguridad';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { ReglaUltimoAdministrador } from '../dominio/regla-ultimo-administrador';
import type { Rol } from '../dominio/rol';
import type { Usuario } from '../dominio/usuario';
import { ErrorUsuarioNoEncontrado } from './errores';

export interface DependenciasReemplazarRoles {
  readonly usuarios: RepositorioUsuarios;
  readonly almacen: AlmacenVersionSeguridad;
  readonly reloj: Reloj;
  readonly eventos: RegistroEventosSeguridad;
}

/**
 * Deja vigentes exactamente los roles indicados (FR-018). Los que se quitan quedan en el historial
 * con quién los retiró y cuándo (FR-019); el cambio vale desde la siguiente operación del usuario
 * (FR-015) y nunca deja al sistema sin administrador activo (FR-020).
 */
export class ReemplazarRoles {
  constructor(private readonly d: DependenciasReemplazarRoles) {}

  async ejecutar(usuarioId: string, roles: readonly Rol[], porUsuarioId: string): Promise<Usuario> {
    const ahora = this.d.reloj.ahora();
    // Objeto (no `let`): el callback lo modifica dentro de la transacción.
    const efecto = { huboCambios: false };
    const usuario = await this.d.usuarios.modificar(usuarioId, (actual, administradores) => {
      const cambios = actual.reemplazarRoles(roles, porUsuarioId, ahora);
      efecto.huboCambios = cambios.retirados.length > 0 || cambios.creados.length > 0;
      ReglaUltimoAdministrador.verificar(administradores, actual);
      // Un evento por rol quitado o asignado, en la misma transacción (009).
      const evento = (accion: 'ROL_ASIGNADO' | 'ROL_QUITADO', rol: Rol) =>
        eventoGestion({
          accion,
          administradorId: porUsuarioId,
          usuarioId: actual.id,
          en: ahora,
          detalle: { rol },
        });
      return [
        ...cambios.retirados.map((rol) => evento('ROL_QUITADO', rol)),
        ...cambios.creados.map((rol) => evento('ROL_ASIGNADO', rol)),
      ];
    });
    if (usuario === null) {
      throw new ErrorUsuarioNoEncontrado();
    }

    if (efecto.huboCambios) {
      await this.d.almacen.publicarVersion(usuario.id, usuario.versionSeguridad);
      this.d.eventos.registrar('roles-cambiados', { usuarioId: usuario.id });
    }
    return usuario;
  }
}
