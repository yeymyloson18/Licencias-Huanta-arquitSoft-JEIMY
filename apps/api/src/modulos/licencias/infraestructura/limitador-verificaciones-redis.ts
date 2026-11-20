import type Redis from 'ioredis';
import {
  ErrorLimitadorNoDisponible,
  type LimitadorVerificaciones,
  type ReservaVerificacion,
} from '../dominio/puertos';

const VENTANA_SEGUNDOS = 15 * 60;
const MAXIMO_FALLOS = 10;

/** Suma el intento y fija la ventana de 15 minutos desde el primero (igual que la consulta de la 004). */
const SCRIPT_RESERVAR = `
local cuenta = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return { cuenta, redis.call('TTL', KEYS[1]) }
`;

const SCRIPT_LIBERAR = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('DECR', KEYS[1])
end
return 0
`;

const clave = (origen: string) => `lim:verificacion:ip:${origen}`;

/**
 * Verificaciones fallidas por origen en Redis, compartidas por todas las instancias (research §R-12 de
 * la 006). Si Redis no responde, falla cerrado.
 */
export class LimitadorVerificacionesRedis implements LimitadorVerificaciones {
  constructor(private readonly redis: Redis) {}

  async reservar(origen: string): Promise<ReservaVerificacion> {
    let respuesta: unknown;
    try {
      respuesta = await this.redis.eval(SCRIPT_RESERVAR, 1, clave(origen), VENTANA_SEGUNDOS);
    } catch {
      throw new ErrorLimitadorNoDisponible();
    }
    const [cuenta, ttl] = Array.isArray(respuesta) ? respuesta.map(Number) : [NaN, NaN];
    if (cuenta === undefined || Number.isNaN(cuenta)) {
      throw new ErrorLimitadorNoDisponible();
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
      throw new ErrorLimitadorNoDisponible();
    }
  }
}
