import {
  ErrorLimitadorNoDisponible,
  type LimitadorPreguntas,
  type ReservaPregunta,
} from '../dominio/puertos';

// Límite por persona del chat de orientación (012, research R-08): el mismo algoritmo que el límite
// de intentos de la 002 (INCR + EXPIRE … NX + TTL en un MULTI, ventana fija de 15 minutos desde la
// primera pregunta), compartido por todas las instancias. La clave lleva la huella de la conexión,
// nunca la IP. Si Redis no responde, falla cerrado.

export const PREFIJO_LIMITE_ORIENTACION = 'lim:orientacion:';
const VENTANA_SEGUNDOS = 15 * 60;

/** Lo que este adaptador usa de ioredis (permite un doble en las pruebas). */
export interface ClienteRedisLimite {
  multi(): LoteRedis;
}

interface LoteRedis {
  incr(clave: string): LoteRedis;
  expire(clave: string, segundos: number, modo: 'NX'): LoteRedis;
  ttl(clave: string): LoteRedis;
  exec(): Promise<[Error | null, unknown][] | null>;
}

export class LimitadorPreguntasRedis implements LimitadorPreguntas {
  constructor(
    private readonly redis: ClienteRedisLimite,
    private readonly maximo: number,
  ) {}

  async reservar(huella: string): Promise<ReservaPregunta> {
    const clave = `${PREFIJO_LIMITE_ORIENTACION}${huella}`;
    let resultados: [Error | null, unknown][] | null;
    try {
      resultados = await this.redis
        .multi()
        .incr(clave)
        .expire(clave, VENTANA_SEGUNDOS, 'NX')
        .ttl(clave)
        .exec();
    } catch {
      throw new ErrorLimitadorNoDisponible();
    }
    if (resultados === null || resultados.some(([error]) => error !== null)) {
      throw new ErrorLimitadorNoDisponible();
    }
    const cuenta = Number(resultados[0]?.[1]);
    if (cuenta <= this.maximo) {
      return { permitido: true, segundosRestantes: 0 };
    }
    const ttl = Number(resultados[2]?.[1]);
    // Sin TTL (no debería pasar) se asume la ventana completa.
    return { permitido: false, segundosRestantes: ttl > 0 ? Math.ceil(ttl) : VENTANA_SEGUNDOS };
  }
}
