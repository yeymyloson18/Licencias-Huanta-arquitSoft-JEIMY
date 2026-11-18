import { Celular } from '../dominio/celular';
import { NombreCompleto } from '../dominio/nombre-completo';
import type { AlmacenVersionSeguridad } from '../dominio/puertos/almacen-version-seguridad';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioSesiones } from '../dominio/puertos/repositorio-sesiones';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { ReglaUltimoAdministrador } from '../dominio/regla-ultimo-administrador';
import type { Usuario } from '../dominio/usuario';
import { ErrorDatosInvalidos, ErrorUsuarioNoEncontrado } from './errores';
import { leerCampo } from './leer-campos';

export interface DependenciasActualizarUsuario {
  readonly usuarios: RepositorioUsuarios;
  readonly sesiones: RepositorioSesiones;
  readonly almacen: AlmacenVersionSeguridad;
  readonly reloj: Reloj;
  readonly eventos: RegistroEventosSeguridad;
}

/** Lo que el administrador puede cambiar (FR-018). El correo no es editable (FR-017). */
export interface CambiosUsuario {
  readonly nombreCompleto?: string;
  readonly celular?: string;
  readonly activo?: boolean;
}

/**
 * Cambia el nombre, el celular o el estado de un usuario. Desactivar cierra al instante todas sus
 * sesiones (FR-011) y nunca puede dejar al sistema sin administrador activo (FR-020).
 */
export class ActualizarUsuario {
  constructor(private readonly d: DependenciasActualizarUsuario) {}

  async ejecutar(usuarioId: string, cambios: CambiosUsuario): Promise<Usuario> {
    const invalidos: string[] = [];
    const nombre =
      cambios.nombreCompleto === undefined
        ? undefined
        : leerCampo('nombreCompleto', invalidos, () =>
            NombreCompleto.crear(cambios.nombreCompleto ?? ''),
          );
    const celular =
      cambios.celular === undefined
        ? undefined
        : leerCampo('celular', invalidos, () => Celular.crear(cambios.celular ?? ''));
    if (invalidos.length > 0) {
      throw new ErrorDatosInvalidos(invalidos);
    }

    // Objeto (no `let`): el callback lo modifica dentro de la transacción.
    const efecto = { seDesactivo: false };
    const usuario = await this.d.usuarios.modificar(usuarioId, (actual, administradores) => {
      if (nombre) {
        actual.cambiarNombre(nombre);
      }
      if (celular) {
        actual.cambiarCelular(celular);
      }
      if (cambios.activo === false && actual.activo) {
        actual.desactivar();
        efecto.seDesactivo = true;
      } else if (cambios.activo === true) {
        actual.reactivar();
      }
      ReglaUltimoAdministrador.verificar(administradores, actual);
    });
    if (usuario === null) {
      throw new ErrorUsuarioNoEncontrado();
    }

    // Después del COMMIT: la versión nueva y las sesiones revocadas llegan a la caché (§R-07).
    await this.d.almacen.publicarVersion(usuario.id, usuario.versionSeguridad);
    if (efecto.seDesactivo) {
      const revocadas = await this.d.sesiones.revocarTodasDelUsuario(
        usuario.id,
        this.d.reloj.ahora(),
      );
      await this.d.almacen.marcarSesionesRevocadas(revocadas);
      this.d.eventos.registrar('usuario-desactivado', { usuarioId: usuario.id });
    }
    return usuario;
  }
}
