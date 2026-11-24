import type Redis from 'ioredis';
import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { Correo } from '../dominio/correo';
import type {
  BloqueosActuales,
  BloqueosCuentas,
  EstadoBloqueo,
} from '../dominio/puertos/bloqueos-cuentas';
import { ErrorLimitadorNoDisponible } from '../dominio/puertos/limitador-intentos';
import { PREFIJO_CORREO, PREFIJO_ORIGEN } from './limitador-intentos-redis';

/** Con 5 fallos en la ventana, el siguiente intento se rechaza: la cuenta está bloqueada (002). */
const FALLOS_PARA_BLOQUEAR = 5;
const LOTE_SCAN = 500;

/**
 * Bloqueos del ingreso leídos de las mismas claves de Redis que usa `LimitadorIntentosRedis`
 * (research §R-05 de la 009). Recorre con `SCAN` (nunca `KEYS`, que bloquea Redis) y lee los
 * contadores con `MGET`. El correo se identifica por su HMAC: nunca se lee ni se devuelve en claro.
 */
export class BloqueosCuentasRedis implements BloqueosCuentas {
  constructor(
    private readonly redis: Redis,
    private readonly protector: ProtectorDatos,
  ) {}

  async bloqueosActuales(): Promise<BloqueosActuales | null> {
    try {
      const correos = await this.bloqueadas(PREFIJO_CORREO);
      const origenes = await this.bloqueadas(PREFIJO_ORIGEN);
      return {
        correosHmac: correos.map((clave) => clave.slice(PREFIJO_CORREO.length)),
        origenes: origenes.length,
      };
    } catch {
      return null;
    }
  }

  async estadoDeCuenta(correo: Correo, ahora: Date): Promise<EstadoBloqueo | null> {
    const clave = this.clave(correo);
    try {
      const [valor, ttl] = await Promise.all([this.redis.get(clave), this.redis.ttl(clave)]);
      if (Number(valor ?? 0) < FALLOS_PARA_BLOQUEAR || ttl <= 0) {
        return { bloqueada: false, hasta: null };
      }
      return { bloqueada: true, hasta: new Date(ahora.getTime() + ttl * 1000) };
    } catch {
      return null;
    }
  }

  async desbloquear(correo: Correo): Promise<void> {
    try {
      await this.redis.del(this.clave(correo));
    } catch {
      throw new ErrorLimitadorNoDisponible();
    }
  }

  private clave(correo: Correo): string {
    return `${PREFIJO_CORREO}${Buffer.from(this.protector.hmac(correo.valor)).toString('hex')}`;
  }

  /** Claves con ese prefijo cuyo contador llegó al límite. */
  private async bloqueadas(prefijo: string): Promise<string[]> {
    const resultado: string[] = [];
    let cursor = '0';
    do {
      const [siguiente, claves] = await this.redis.scan(
        cursor,
        'MATCH',
        `${prefijo}*`,
        'COUNT',
        LOTE_SCAN,
      );
      cursor = siguiente;
      if (claves.length > 0) {
        const valores = await this.redis.mget(...claves);
        claves.forEach((clave, indice) => {
          if (Number(valores[indice] ?? 0) >= FALLOS_PARA_BLOQUEAR) {
            resultado.push(clave);
          }
        });
      }
    } while (cursor !== '0');
    return resultado;
  }
}
