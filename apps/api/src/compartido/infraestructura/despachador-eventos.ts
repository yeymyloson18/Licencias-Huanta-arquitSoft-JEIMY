import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { PrismaServicio } from './prisma.servicio';

// Despachador de la cola de eventos `comun.evento_pendiente` (ADR-005, research §R-02 de la 005).
// Cada módulo registra un manejador por tipo de evento; los tipos sin manejador quedan pendientes
// para funcionalidades posteriores.

/**
 * Procesa un evento. Debe ser idempotente: la entrega es "al menos una vez". `meta.id` identifica el
 * evento (sirve como clave de idempotencia, research §R-02 de la 006).
 */
export type ManejadorEvento = (datos: unknown, meta: { readonly id: bigint }) => Promise<void>;

/** Clave del candado de PostgreSQL: solo una réplica de la API procesa a la vez. */
const CLAVE_CANDADO = 4_005_001;
const LOTE = 50;
const ESPERA_BASE_MS = 2_000;
const ESPERA_MAXIMA_MS = 5 * 60 * 1000;
const AVISO_CADA_FALLOS = 10;
const TIEMPO_MAXIMO_MS = 60_000;

interface FilaEvento {
  readonly id: bigint;
  readonly tipo: string;
  readonly datos: unknown;
  readonly intentos: number;
}

export interface ResultadoPasada {
  readonly procesados: number;
  readonly fallidos: number;
}

/** Espera antes del próximo intento: 2 s × 2^intentos, como máximo 5 minutos. */
export const esperaTrasFallos = (intentos: number): number =>
  Math.min(ESPERA_MAXIMA_MS, ESPERA_BASE_MS * 2 ** Math.min(intentos, 20));

export class DespachadorEventos implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('DespachadorEventos');
  private readonly manejadores = new Map<string, ManejadorEvento>();
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaServicio,
    private readonly intervaloMs: number,
  ) {}

  /** Un manejador por tipo; registrar dos veces el mismo tipo es un error de programación. */
  registrar(tipo: string, manejador: ManejadorEvento): void {
    if (this.manejadores.has(tipo)) {
      throw new Error(`Ya hay un manejador para el evento ${tipo}`);
    }
    this.manejadores.set(tipo, manejador);
  }

  onApplicationBootstrap(): void {
    if (this.intervaloMs <= 0) {
      return;
    }
    this.temporizador = setInterval(() => {
      void this.procesarPendientes().catch(() => {
        this.logger.warn('No se pudo revisar la cola de eventos en esta pasada');
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

  /**
   * Una pasada: toma hasta 50 eventos pendientes de los tipos con manejador (y cuya espera ya pasó),
   * los entrega en orden y los marca procesados, o anota el fallo para reintentarlo más tarde.
   * `null` si otra réplica tenía el candado.
   */
  async procesarPendientes(): Promise<ResultadoPasada | null> {
    const tipos = [...this.manejadores.keys()];
    if (tipos.length === 0) {
      return { procesados: 0, fallidos: 0 };
    }
    return this.prisma.$transaction(
      async (tx) => {
        const [candado] = await tx.$queryRaw<[{ obtenido: boolean }]>`
          SELECT pg_try_advisory_xact_lock(${CLAVE_CANDADO}) AS obtenido`;
        if (!candado.obtenido) {
          return null;
        }
        const eventos = await tx.$queryRaw<FilaEvento[]>`
          SELECT id, tipo, datos, intentos
            FROM comun.evento_pendiente
           WHERE procesado_en IS NULL
             AND tipo = ANY(${tipos}::varchar[])
             AND (reintentar_en IS NULL OR reintentar_en <= now())
           ORDER BY id
           LIMIT ${LOTE}
             FOR UPDATE SKIP LOCKED`;
        let procesados = 0;
        let fallidos = 0;
        for (const evento of eventos) {
          const manejador = this.manejadores.get(evento.tipo);
          try {
            await manejador?.(evento.datos, { id: evento.id });
            await tx.$executeRaw`
              UPDATE comun.evento_pendiente SET procesado_en = now() WHERE id = ${evento.id}`;
            procesados += 1;
          } catch (error) {
            fallidos += 1;
            const intentos = evento.intentos + 1;
            // Solo el nombre del error: el mensaje podría traer datos (principio VII).
            const nombre = error instanceof Error ? error.name : 'Error';
            const espera = esperaTrasFallos(intentos);
            await tx.$executeRaw`
              UPDATE comun.evento_pendiente
                 SET intentos = ${intentos},
                     ultimo_error = ${nombre},
                     reintentar_en = now() + (${espera} * interval '1 millisecond')
               WHERE id = ${evento.id}`;
            if (intentos % AVISO_CADA_FALLOS === 0) {
              this.logger.warn(
                `El evento ${String(evento.id)} (${evento.tipo}) lleva ${String(intentos)} intentos fallidos`,
              );
            }
          }
        }
        return { procesados, fallidos };
      },
      { timeout: TIEMPO_MAXIMO_MS },
    );
  }
}
