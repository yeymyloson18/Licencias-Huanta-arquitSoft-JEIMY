import type {
  AlmacenVersionSeguridad,
  EstadoSeguridadEnCache,
} from '../dominio/puertos/almacen-version-seguridad';

/**
 * Almacén provisional en memoria (US1): guarda las marcas de sesión revocada y las versiones, pero
 * no se comparte entre instancias. En US2 (T048) lo reemplaza el adaptador de Redis y el guard
 * empieza a consultarlo (research.md §R-07).
 */
export class AlmacenVersionSeguridadEnMemoria implements AlmacenVersionSeguridad {
  private readonly versiones = new Map<string, number>();
  private readonly revocadas = new Set<string>();

  leerEstado(usuarioId: string, sesionId: string): Promise<EstadoSeguridadEnCache | null> {
    return Promise.resolve({
      version: this.versiones.get(usuarioId) ?? null,
      sesionRevocada: this.revocadas.has(sesionId),
    });
  }

  publicarVersion(usuarioId: string, version: number): Promise<void> {
    this.versiones.set(usuarioId, version);
    return Promise.resolve();
  }

  marcarSesionesRevocadas(sesionIds: readonly string[]): Promise<void> {
    for (const id of sesionIds) {
      this.revocadas.add(id);
    }
    return Promise.resolve();
  }
}
