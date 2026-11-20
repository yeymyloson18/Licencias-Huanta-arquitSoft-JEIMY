import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { z } from 'zod';
import type { FachadaTramites } from '../../tramites/fachada';
import type { CrearAviso, EnviarAvisosPendientes } from '../aplicacion/avisos';
import type { Canal } from '../dominio/aviso';
import type { EnviadorMensajes, ExpedientesAvisos } from '../dominio/puertos';

/** Un aviso simulado queda una hora en Redis para revisarlo en desarrollo (como el OTP de la 004). */
const VIDA_AVISO_SIMULADO_SEGUNDOS = 3600;

/**
 * Enviador simulado (FR-035): deja el texto del aviso en Redis `dev:aviso:<id>` con caducidad. No
 * guarda el destinatario en claro. El correo y el SMS reales llegan cuando la Municipalidad contrate
 * el servicio.
 */
export class EnviadorSimuladoRedis implements EnviadorMensajes {
  constructor(private readonly redis: Redis) {}

  async enviar(mensaje: {
    readonly id: string;
    readonly canal: Canal;
    readonly destino: string;
    readonly texto: string;
  }): Promise<void> {
    await this.redis.set(
      `dev:aviso:${mensaje.id}`,
      JSON.stringify({ canal: mensaje.canal, texto: mensaje.texto }),
      'EX',
      VIDA_AVISO_SIMULADO_SEGUNDOS,
    );
  }
}

/** Adaptador de `ExpedientesAvisos` sobre la fachada de Trámites (principio I). */
export class ExpedientesFachadaTramites implements ExpedientesAvisos {
  constructor(private readonly tramites: FachadaTramites) {}

  contactoTitular(numero: string) {
    return this.tramites.contactoTitular(numero);
  }

  textoDeEstado(estado: string) {
    return this.tramites.textoDeEstado(estado);
  }
}

/** Tarea periódica que envía los avisos pendientes (`AVISOS_INTERVALO_MS`; 0 = solo a mano). */
export class TareaEnvioAvisos {
  private readonly logger = new Logger('EnvioAvisos');
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    private readonly enviar: EnviarAvisosPendientes,
    private readonly intervaloMs: number,
  ) {}

  onApplicationBootstrap(): void {
    if (this.intervaloMs <= 0) {
      return;
    }
    this.temporizador = setInterval(() => {
      void this.enviar.ejecutar().catch(() => {
        this.logger.warn('No se pudieron enviar los avisos en esta pasada');
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
}

/** El evento no tiene la forma esperada; el despachador lo reintenta y avisa cada 10 fallos. */
export class ErrorEventoInvalidoAvisos extends Error {
  constructor(tipo: string) {
    super(`Evento ${tipo} inválido`);
    this.name = 'ErrorEventoInvalidoAvisos';
  }
}

const NUMERO_EXPEDIENTE = z.string().regex(/^EXP-[0-9]{4}-[0-9]{6}$/);
const esquemaCambio = z.object({ numeroExpediente: NUMERO_EXPEDIENTE, estadoNuevo: z.string() });
const esquemaItse = z.object({ numeroExpediente: NUMERO_EXPEDIENTE, venceEn: z.iso.date() });

/** `EstadoExpedienteCambiado` → aviso al titular (un aviso por evento). */
export const manejadorCambioEstado =
  (crear: CrearAviso) =>
  async (datos: unknown, meta: { readonly id: bigint }): Promise<void> => {
    const evento = esquemaCambio.safeParse(datos);
    if (!evento.success) {
      throw new ErrorEventoInvalidoAvisos('EstadoExpedienteCambiado');
    }
    await crear.cambioDeEstado({ eventoId: meta.id, ...evento.data });
  };

/** `ItsePorVencer` → aviso al titular 30 días antes del vencimiento del certificado. */
export const manejadorItsePorVencer =
  (crear: CrearAviso) =>
  async (datos: unknown, meta: { readonly id: bigint }): Promise<void> => {
    const evento = esquemaItse.safeParse(datos);
    if (!evento.success) {
      throw new ErrorEventoInvalidoAvisos('ItsePorVencer');
    }
    await crear.itsePorVencer({ eventoId: meta.id, ...evento.data });
  };
