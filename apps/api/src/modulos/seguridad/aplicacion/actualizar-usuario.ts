import { eventoGestion, type CampoEditable } from '../dominio/evento-auditoria';
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

  async ejecutar(
    usuarioId: string,
    cambios: CambiosUsuario,
    administradorId: string,
  ): Promise<Usuario> {
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
    const ahora = this.d.reloj.ahora();
    const usuario = await this.d.usuarios.modificar(usuarioId, (actual, administradores) => {
      const estabaActivo = actual.activo;
      const campos: CampoEditable[] = [];
      if (nombre) {
        actual.cambiarNombre(nombre);
        campos.push('nombreCompleto');
      }
      if (celular) {
        actual.cambiarCelular(celular);
        campos.push('celular');
      }
      if (cambios.activo === false && actual.activo) {
        actual.desactivar();
        efecto.seDesactivo = true;
      } else if (cambios.activo === true) {
        actual.reactivar();
      }
      ReglaUltimoAdministrador.verificar(administradores, actual);

      // Auditoría en la misma transacción (009): solo los nombres de los campos, nunca sus valores.
      const evento = (
        accion: 'USUARIO_EDITADO' | 'USUARIO_DESACTIVADO' | 'USUARIO_REACTIVADO',
        detalle?: { readonly campos: readonly CampoEditable[] },
      ) =>
        eventoGestion({
          accion,
          administradorId,
          usuarioId: actual.id,
          en: ahora,
          ...(detalle === undefined ? {} : { detalle }),
        });
      return [
        ...(campos.length > 0 ? [evento('USUARIO_EDITADO', { campos })] : []),
        ...(efecto.seDesactivo ? [evento('USUARIO_DESACTIVADO')] : []),
        ...(!estabaActivo && cambios.activo === true ? [evento('USUARIO_REACTIVADO')] : []),
      ];
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
