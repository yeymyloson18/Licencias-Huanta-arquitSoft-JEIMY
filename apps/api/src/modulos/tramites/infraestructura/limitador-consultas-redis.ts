import type Redis from 'ioredis';
import {
  ErrorLimitadorConsultasNoDisponible,
  type LimitadorConsultas,
  type ReservaConsulta,
} from '../dominio/puertos/limitador-consultas';

const VENTANA_SEGUNDOS = 15 * 60;
const MAXIMO_FALLOS = 5;

/**
 * Reserva atómica en un solo script: suma el intento, fija la ventana fija de 15 minutos desde el
 * primer intento (solo si no tenía) y devuelve la cuenta y el tiempo que falta.
 */
const SCRIPT_RESERVAR = `
local cuenta = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return { cuenta, redis.call('TTL', KEYS[1]) }
`;

/** Devuelve el intento solo si el contador sigue vivo (sin crear contadores sin vencimiento). */
const SCRIPT_LIBERAR = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('DECR', KEYS[1])
end
return 0
`;

const clave = (origen: string) => `lim:consulta:ip:${origen}`;

/**
 * Contador de consultas fallidas por origen en Redis, compartido por todas las instancias (research
 * §R-07 de la 004). Si Redis no responde, falla cerrado.
 */
export class LimitadorConsultasRedis implements LimitadorConsultas {
  constructor(private readonly redis: Redis) {}

  async reservar(origen: string): Promise<ReservaConsulta> {
    let respuesta: unknown;
    try {
      respuesta = await this.redis.eval(SCRIPT_RESERVAR, 1, clave(origen), VENTANA_SEGUNDOS);
    } catch {
      throw new ErrorLimitadorConsultasNoDisponible();
    }
    const [cuenta, ttl] = Array.isArray(respuesta) ? respuesta.map(Number) : [NaN, NaN];
    if (cuenta === undefined || Number.isNaN(cuenta)) {
      throw new ErrorLimitadorConsultasNoDisponible();
    }
    if (cuenta <= MAXIMO_FALLOS) {
      return { permitido: true, segundosRestantes: 0 };
    }
    return {
      permitido: false,
      segundosRestantes: ttl !== undefined && ttl > 0 ? ttl : VENTANA_SEGUNDOS,
    };
  }

  async liberar(origen: string): Promise<void> {
    try {
      await this.redis.eval(SCRIPT_LIBERAR, 1, clave(origen));
    } catch {
      throw new ErrorLimitadorConsultasNoDisponible();
    }
  }
}
