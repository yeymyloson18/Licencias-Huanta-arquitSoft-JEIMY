import type { AlmacenVersionSeguridad } from '../dominio/puertos/almacen-version-seguridad';
import type { EmisorTokens } from '../dominio/puertos/emisor-tokens';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioSesiones } from '../dominio/puertos/repositorio-sesiones';
import type { RepositorioUsuarios } from '../dominio/puertos/repositorio-usuarios';
import { emitirSesion, sesionDelRefresh, type SesionEmitida } from './emitir-sesion';
import { ErrorAutenticacion } from './errores';

export interface DependenciasRenovarSesion {
  readonly sesiones: RepositorioSesiones;
  readonly usuarios: RepositorioUsuarios;
  readonly generador: GeneradorSecretos;
  readonly emisor: EmisorTokens;
  readonly reloj: Reloj;
  readonly eventos: RegistroEventosSeguridad;
  readonly almacen: AlmacenVersionSeguridad;
}

/**
 * Renueva el token de acceso y rota el refresh token (FR-003, FR-003a; research.md §R-06). Si alguien
 * presenta un refresh ya rotado más de 10 s después, se asume robo y se cierran todas las sesiones
 * del usuario.
 */
export class RenovarSesion {
  constructor(private readonly d: DependenciasRenovarSesion) {}

  async ejecutar(entrada: { refreshToken: string }): Promise<SesionEmitida> {
    const sesionId = sesionDelRefresh(entrada.refreshToken);
    const sesion = sesionId === null ? null : await this.d.sesiones.obtenerPorId(sesionId);
    if (sesion === null) {
      throw new ErrorAutenticacion();
    }

    const ahora = this.d.reloj.ahora();
    const nuevoRefresh = this.d.generador.refreshToken(sesion.id);
    const resultado = sesion.renovar(
      this.d.generador.sha256(entrada.refreshToken),
      this.d.generador.sha256(nuevoRefresh),
      ahora,
      (a, b) => this.d.generador.igualesEnTiempoConstante(a, b),
    );

    if (resultado === 'REUTILIZADA') {
      const revocadas = await this.d.sesiones.revocarTodasDelUsuario(sesion.usuarioId, ahora);
      await this.d.almacen.marcarSesionesRevocadas(revocadas);
      this.d.eventos.registrar('reutilizacion-refresh', {
        usuarioId: sesion.usuarioId,
        sesionId: sesion.id,
      });
      throw new ErrorAutenticacion();
    }
    if (resultado !== 'ROTADA') {
      throw new ErrorAutenticacion();
    }

    const usuario = await this.d.usuarios.obtenerPorId(sesion.usuarioId);
    if (usuario?.activo !== true) {
      throw new ErrorAutenticacion();
    }

    await this.d.sesiones.guardar(sesion);
    return emitirSesion(this.d.emisor, usuario, sesion, nuevoRefresh);
  }
}
