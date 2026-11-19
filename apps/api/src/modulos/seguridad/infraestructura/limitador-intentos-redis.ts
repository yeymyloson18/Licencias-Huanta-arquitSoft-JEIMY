import type Redis from 'ioredis';
import type { Correo } from '../dominio/correo';
import {
  ErrorLimitadorNoDisponible,
  type LimitadorIntentos,
  type ResultadoReserva,
} from '../dominio/puertos/limitador-intentos';
import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';

const VENTANA_SEGUNDOS = 15 * 60;
const MAXIMO_FALLOS = 5;
const MAXIMO_ENVIOS = 3;

/**
 * Decrementa cada clave solo si todavía existe: si la ventana venció entre la reserva y la
 * liberación, no crea un contador negativo sin vencimiento.
 */
const SCRIPT_LIBERAR = `
for _, clave in ipairs(KEYS) do
  if redis.call('EXISTS', clave) == 1 then
    redis.call('DECR', clave)
  end
end
return 0
`;

/**
 * Contadores de intentos en Redis, compartidos por todas las instancias (research.md §R-08).
 *
 * Reserva atómica: `INCR` + `EXPIRE … NX` (+ `TTL`) en un `MULTI`; el valor que devuelve el `INCR` ya
 * incluye este intento, así que con N peticiones simultáneas solo las que obtienen un valor ≤ límite
 * pasan. La ventana es fija: 15 minutos desde el primer intento. El correo se identifica por su HMAC,
 * nunca en claro. Si Redis no responde, lanza `ErrorLimitadorNoDisponible` (falla cerrado, FR-009).
 */
export class LimitadorIntentosRedis implements LimitadorIntentos {
  constructor(
    private readonly redis: Redis,
    private readonly protector: ProtectorDatos,
  ) {}

  reservarIntento(correo: Correo | null, ip: string): Promise<ResultadoReserva> {
    return this.reservar(this.clavesIntento(correo, ip), MAXIMO_FALLOS);
  }

  liberarIntento(correo: Correo | null, ip: string): Promise<void> {
    return this.liberar(this.clavesIntento(correo, ip));
  }

  reservarEnvio(usuarioId: string): Promise<ResultadoReserva> {
    return this.reservar([claveEnvios(usuarioId)], MAXIMO_ENVIOS);
  }

  liberarEnvio(usuarioId: string): Promise<void> {
    return this.liberar([claveEnvios(usuarioId)]);
  }

  private clavesIntento(correo: Correo | null, ip: string): string[] {
    const claves = [`lim:fallos:ip:${ip}`];
    if (correo !== null) {
      const hmac = Buffer.from(this.protector.hmac(correo.valor)).toString('hex');
      claves.unshift(`lim:fallos:correo:${hmac}`);
    }
    return claves;
  }

  private async reservar(claves: readonly string[], maximo: number): Promise<ResultadoReserva> {
    let resultados: [Error | null, unknown][];
    try {
      const lote = this.redis.multi();
      for (const clave of claves) {
        lote.incr(clave).expire(clave, VENTANA_SEGUNDOS, 'NX').ttl(clave);
      }
      resultados = comprobarResultados(await lote.exec());
    } catch {
      throw new ErrorLimitadorNoDisponible();
    }

    let permitido = true;
    let segundos = 0;
    for (let i = 0; i < claves.length; i += 1) {
      const cuenta = Number(resultados[i * 3]?.[1] ?? 0);
      if (cuenta > maximo) {
        permitido = false;
        const ttl = Number(resultados[i * 3 + 2]?.[1] ?? -1);
        // Sin TTL (no debería pasar) se asume la ventana completa.
        segundos = Math.max(segundos, ttl > 0 ? Math.ceil(ttl) : VENTANA_SEGUNDOS);
      }
    }
    return permitido
      ? { permitido, segundosRestantes: 0 }
      : { permitido, segundosRestantes: segundos };
  }

  private async liberar(claves: readonly string[]): Promise<void> {
    try {
      await this.redis.eval(SCRIPT_LIBERAR, claves.length, ...claves);
    } catch {
      throw new ErrorLimitadorNoDisponible();
    }
  }
}

const claveEnvios = (usuarioId: string) => `lim:envios:usuario:${usuarioId}`;

const comprobarResultados = (
  resultados: [Error | null, unknown][] | null,
): [Error | null, unknown][] => {
  if (resultados === null || resultados.some(([error]) => error !== null)) {
    throw new Error('Falló un comando de Redis');
  }
  return resultados;
};
