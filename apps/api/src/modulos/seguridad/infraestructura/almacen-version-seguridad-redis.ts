import type Redis from 'ioredis';
import type {
  AlmacenVersionSeguridad,
  EstadoSeguridadEnCache,
} from '../dominio/puertos/almacen-version-seguridad';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';

const VIDA_VERSION_SEGUNDOS = 60;
/** Vida máxima del token de acceso: pasado ese tiempo el token ya venció solo. */
const VIDA_SESION_REVOCADA_SEGUNDOS = 900;

const claveVersion = (usuarioId: string) => `seg:version:${usuarioId}`;
const claveSesion = (sesionId: string) => `seg:sesion-revocada:${sesionId}`;

/**
 * Versión de seguridad y sesiones revocadas en Redis, compartidas por todas las instancias
 * (research.md §R-07). Si Redis no responde, leer devuelve `null` ("desconocido") para que el
 * control de permisos consulte PostgreSQL, y escribir solo registra el evento: la fuente de verdad
 * es la base.
 */
export class AlmacenVersionSeguridadRedis implements AlmacenVersionSeguridad {
  constructor(
    private readonly redis: Redis,
    private readonly eventos: RegistroEventosSeguridad,
  ) {}

  async leerEstado(usuarioId: string, sesionId: string): Promise<EstadoSeguridadEnCache | null> {
    try {
      const [version, revocada] = await this.redis.mget(
        claveVersion(usuarioId),
        claveSesion(sesionId),
      );
      const numero = version === null || version === undefined ? null : Number(version);
      return {
        version: numero !== null && Number.isInteger(numero) ? numero : null,
        sesionRevocada: revocada !== null && revocada !== undefined,
      };
    } catch {
      return null;
    }
  }

  async publicarVersion(usuarioId: string, version: number): Promise<void> {
    try {
      await this.redis.set(claveVersion(usuarioId), String(version), 'EX', VIDA_VERSION_SEGUNDOS);
    } catch {
      this.eventos.registrar('fallo-cache-seguridad', { usuarioId });
    }
  }

  async marcarSesionesRevocadas(sesionIds: readonly string[]): Promise<void> {
    if (sesionIds.length === 0) {
      return;
    }
    try {
      const pipeline = this.redis.pipeline();
      for (const id of sesionIds) {
        pipeline.set(claveSesion(id), '1', 'EX', VIDA_SESION_REVOCADA_SEGUNDOS);
      }
      const resultados = await pipeline.exec();
      if (resultados?.some(([error]) => error !== null) !== false) {
        throw new Error('Falló alguna escritura del pipeline');
      }
    } catch {
      for (const sesionId of sesionIds) {
        this.eventos.registrar('fallo-cache-seguridad', { sesionId });
      }
    }
  }
}
