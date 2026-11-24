import { eventoGestion } from '../dominio/evento-auditoria';
import type { AlmacenVersionSeguridad } from '../dominio/puertos/almacen-version-seguridad';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioSesiones } from '../dominio/puertos/repositorio-sesiones';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { ReglasAccionesAdministrador } from '../dominio/reglas-acciones-administrador';
import { ErrorUsuarioNoEncontrado } from './errores';

export interface DependenciasCerrarSesionesDeUsuario {
  readonly usuarios: RepositorioUsuarios;
  readonly sesiones: RepositorioSesiones;
  readonly almacen: AlmacenVersionSeguridad;
  readonly reloj: Reloj;
}

/**
 * "Cerrar todas sus sesiones" (FR-016 de la 009): revoca las sesiones del usuario sin desactivarlo,
 * con el mismo mecanismo que la desactivación (base y caché de sesiones revocadas). Su
 * `SESIONES_CERRADAS` va en la misma transacción que la revocación. Devuelve cuántas cerró.
 */
export class CerrarSesionesDeUsuario {
  constructor(private readonly d: DependenciasCerrarSesionesDeUsuario) {}

  async ejecutar(usuarioId: string, administradorId: string): Promise<number> {
    ReglasAccionesAdministrador.verificar('CERRAR_SESIONES', administradorId, usuarioId);
    const usuario = await this.d.usuarios.obtenerPorId(usuarioId);
    if (usuario === null) {
      throw new ErrorUsuarioNoEncontrado();
    }
    const ahora = this.d.reloj.ahora();
    const revocadas = await this.d.sesiones.revocarTodasDelUsuario(usuario.id, ahora, (ids) => [
      eventoGestion({
        accion: 'SESIONES_CERRADAS',
        administradorId,
        usuarioId: usuario.id,
        en: ahora,
        detalle: { sesiones: ids.length },
      }),
    ]);
    // Después del COMMIT: el token de acceso de esas sesiones deja de servir al instante (§R-07).
    await this.d.almacen.marcarSesionesRevocadas(revocadas);
    return revocadas.length;
  }
}
