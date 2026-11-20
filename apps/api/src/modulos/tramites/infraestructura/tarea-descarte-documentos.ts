import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { DescartarDocumentosVencidos } from '../aplicacion/descartar-documentos-vencidos';

/** Una vez por hora (research §R-09 de la 004). */
export const INTERVALO_DESCARTE_MS = 60 * 60 * 1000;
/** Clave del candado de PostgreSQL: solo una réplica de la API descarta a la vez. */
const CLAVE_CANDADO = 4_004_001;
const TIEMPO_MAXIMO_MS = 5 * 60 * 1000;

/**
 * Tarea programada que descarta los documentos temporales vencidos. Con varias réplicas, solo la que
 * obtiene el candado consultivo de PostgreSQL trabaja; las demás se saltan la pasada. Se usa
 * `pg_try_advisory_xact_lock` (dentro de una transacción) para que el candado se suelte solo al
 * terminar, aunque el pool de conexiones cambie de conexión. El temporizador lleva `unref()`: no
 * mantiene vivo el proceso. Registra solo cuántos documentos borró, nunca nombres ni claves.
 */
export class TareaDescarteDocumentos implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('TareaDescarteDocumentos');
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaServicio,
    private readonly descartar: DescartarDocumentosVencidos,
    private readonly intervaloMs: number = INTERVALO_DESCARTE_MS,
  ) {}

  onApplicationBootstrap(): void {
    this.temporizador = setInterval(() => {
      void this.ejecutarUnaVez().catch(() => {
        this.logger.warn('No se pudieron descartar los documentos vencidos en esta pasada');
      });
    }, this.intervaloMs);
    this.temporizador.unref();
  }

  onApplicationShutdown(): void {
    if (this.temporizador !== null) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }

  /** Una pasada. `null` si otra réplica tenía el candado. */
  async ejecutarUnaVez(): Promise<number | null> {
    const borrados = await this.prisma.$transaction(
      async (tx) => {
        const [fila] = await tx.$queryRaw<[{ obtenido: boolean }]>`
          SELECT pg_try_advisory_xact_lock(${CLAVE_CANDADO}) AS obtenido`;
        return fila.obtenido ? this.descartar.ejecutar() : null;
      },
      { timeout: TIEMPO_MAXIMO_MS },
    );
    if (borrados !== null && borrados > 0) {
      this.logger.log(`Documentos temporales vencidos descartados: ${String(borrados)}`);
    }
    return borrados;
  }
}
