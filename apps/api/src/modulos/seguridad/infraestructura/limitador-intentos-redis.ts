import type Redis from 'ioredis';
import type { Correo } from '../dominio/correo';
import {
  ErrorLimitadorNoDisponible,
  type EstadoLimite,
  type LimitadorIntentos,
} from '../dominio/puertos/limitador-intentos';
import type { ProtectorDatos } from '../dominio/puertos/protector-datos';

const VENTANA_SEGUNDOS = 15 * 60;
const MAXIMO_FALLOS = 5;
const MAXIMO_ENVIOS = 3;

const LIBRE: EstadoLimite = { bloqueado: false, segundosRestantes: 0 };

/**
 * Contadores de intentos en Redis, compartidos por todas las instancias (research.md §R-08): ventana
 * fija de 15 minutos que empieza con el primer intento (`INCR` + `EXPIRE … NX` en un `MULTI`). El
 * correo se identifica por su HMAC, nunca en claro. Si Redis no responde, lanza
 * `ErrorLimitadorNoDisponible` para que el inicio de sesión falle cerrado (FR-009).
 */
export class LimitadorIntentosRedis implements LimitadorIntentos {
  constructor(
    private readonly redis: Redis,
    private readonly protector: ProtectorDatos,
  ) {}

  consultarFallos(correo: Correo | null, ip: string): Promise<EstadoLimite> {
    return this.consultar(this.clavesFallo(correo, ip), MAXIMO_FALLOS);
  }

  registrarFallo(correo: Correo | null, ip: string): Promise<void> {
    return this.incrementar(this.clavesFallo(correo, ip));
  }

  consultarEnvios(usuarioId: string): Promise<EstadoLimite> {
    return this.consultar([claveEnvios(usuarioId)], MAXIMO_ENVIOS);
  }

  registrarEnvio(usuarioId: string): Promise<void> {
    return this.incrementar([claveEnvios(usuarioId)]);
  }

  private clavesFallo(correo: Correo | null, ip: string): string[] {
    const claves = [`lim:fallos:ip:${ip}`];
    if (correo !== null) {
      const hmac = Buffer.from(this.protector.hmac(correo.valor)).toString('hex');
      claves.unshift(`lim:fallos:correo:${hmac}`);
    }
    return claves;
  }

  private async incrementar(claves: readonly string[]): Promise<void> {
    try {
      const lote = this.redis.multi();
      for (const clave of claves) {
        lote.incr(clave).expire(clave, VENTANA_SEGUNDOS, 'NX');
      }
      comprobarResultados(await lote.exec());
    } catch {
      throw new ErrorLimitadorNoDisponible();
    }
  }

  private async consultar(claves: readonly string[], maximo: number): Promise<EstadoLimite> {
    let resultados: [Error | null, unknown][] | null;
    try {
      const lote = this.redis.pipeline();
      for (const clave of claves) {
        lote.get(clave).ttl(clave);
      }
      resultados = comprobarResultados(await lote.exec());
    } catch {
      throw new ErrorLimitadorNoDisponible();
    }

    let bloqueado = false;
    let segundos = 0;
    for (let i = 0; i < claves.length; i += 1) {
      const cuenta = Number(resultados[i * 2]?.[1] ?? 0);
      if (cuenta >= maximo) {
        bloqueado = true;
        const ttl = Number(resultados[i * 2 + 1]?.[1] ?? -1);
        // Sin TTL (no debería pasar) se asume la ventana completa.
        segundos = Math.max(segundos, ttl > 0 ? Math.ceil(ttl) : VENTANA_SEGUNDOS);
      }
    }
    return bloqueado ? { bloqueado, segundosRestantes: segundos } : LIBRE;
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
