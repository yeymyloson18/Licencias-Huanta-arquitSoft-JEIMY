import { Logger } from '@nestjs/common';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';

/** Clave del candado de PostgreSQL: una sola réplica ejecuta el reloj a la vez (ADR-006, EQ-07). */
const CLAVE_CANDADO = 4_006_001;
const TIEMPO_MAXIMO_MS = 5 * 60 * 1000;

export type TareaReloj = () => Promise<unknown>;

/**
 * Reloj de plazos (research §R-07 de la 006): al iniciar y cada `intervaloMs` (0 = solo a mano, en
 * las pruebas) toma `pg_try_advisory_xact_lock` y, si lo obtiene, ejecuta sus tareas en orden
 * (alertas de plazo; aviso del ITSE por vencer). Si otra réplica tiene el candado, no hace nada.
 */
export class RelojPlazos {
  private readonly logger = new Logger('RelojPlazos');
  private readonly tareas: { readonly nombre: string; readonly tarea: TareaReloj }[] = [];
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaServicio,
    private readonly intervaloMs: number,
  ) {}

  registrar(nombre: string, tarea: TareaReloj): void {
    this.tareas.push({ nombre, tarea });
  }

  onApplicationBootstrap(): void {
    if (this.intervaloMs <= 0) {
      return;
    }
    const pasada = () => {
      void this.ejecutarPasada().catch(() => {
        this.logger.warn('No se pudo completar la pasada del reloj de plazos');
      });
    };
    pasada();
    this.temporizador = setInterval(pasada, this.intervaloMs);
    this.temporizador.unref();
  }

  onApplicationShutdown(): void {
    if (this.temporizador !== null) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }

  /** Una pasada; `null` si otra réplica tenía el candado. Devuelve las tareas que se ejecutaron. */
  ejecutarPasada(): Promise<readonly string[] | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const [candado] = await tx.$queryRaw<[{ obtenido: boolean }]>`
          SELECT pg_try_advisory_xact_lock(${CLAVE_CANDADO}) AS obtenido`;
        if (!candado.obtenido) {
          return null;
        }
        const ejecutadas: string[] = [];
        for (const { nombre, tarea } of this.tareas) {
          try {
            await tarea();
            ejecutadas.push(nombre);
          } catch (error) {
            // Solo el nombre del error: ningún dato del expediente en los registros.
            this.logger.warn(
              `La tarea ${nombre} del reloj falló (${error instanceof Error ? error.name : 'Error'})`,
            );
          }
        }
        return ejecutadas;
      },
      { timeout: TIEMPO_MAXIMO_MS, maxWait: TIEMPO_MAXIMO_MS },
    );
  }
}
