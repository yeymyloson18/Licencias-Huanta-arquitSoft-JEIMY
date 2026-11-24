import { eventoPropio } from '../dominio/evento-auditoria';
import type { AlmacenVersionSeguridad } from '../dominio/puertos/almacen-version-seguridad';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioSesiones } from '../dominio/puertos/repositorio-sesiones';
import { sesionDelRefresh } from './emitir-sesion';

export interface DependenciasCerrarSesion {
  readonly sesiones: RepositorioSesiones;
  readonly generador: GeneradorSecretos;
  readonly reloj: Reloj;
  readonly almacen: AlmacenVersionSeguridad;
}

/**
 * Cierra la sesión del refresh token presentado (FR-004). Es idempotente: sin sesión válida no hace
 * nada. Exige el refresh vigente o el anterior de la sesión, no basta con conocer su id. Después de
 * guardar, marca la sesión como revocada para que su token de acceso deje de servir al instante.
 */
export class CerrarSesion {
  constructor(private readonly d: DependenciasCerrarSesion) {}

  async ejecutar(entrada: { refreshToken?: string }): Promise<void> {
    const refresh = entrada.refreshToken ?? '';
    const sesionId = sesionDelRefresh(refresh);
    const sesion = sesionId === null ? null : await this.d.sesiones.obtenerPorId(sesionId);
    if (sesion === null || sesion.revocada) {
      return;
    }
    const hash = this.d.generador.sha256(refresh);
    if (!sesion.reconoce(hash, (a, b) => this.d.generador.igualesEnTiempoConstante(a, b))) {
      return;
    }

    const ahora = this.d.reloj.ahora();
    sesion.revocar(ahora);
    // El cierre queda en la auditoría en la misma transacción (009). Sin origen: no es un intento.
    await this.d.sesiones.guardar(sesion, [
      eventoPropio({
        accion: 'CIERRE_SESION',
        usuarioId: sesion.usuarioId,
        origenHmac: null,
        en: ahora,
      }),
    ]);
    await this.d.almacen.marcarSesionesRevocadas([sesion.id]);
  }
}
