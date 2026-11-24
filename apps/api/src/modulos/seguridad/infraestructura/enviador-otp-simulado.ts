import type Redis from 'ioredis';
import type { Celular } from '../dominio/celular';
import { ErrorEnvioOtp, type EnviadorOTP } from '../dominio/puertos/enviador-otp';

const VIDA_SEGUNDOS = 300;

/**
 * Envío simulado del código mientras no haya proveedor de SMS (research.md §R-11): guarda el último
 * código del usuario en Redis (`dev:otp:<usuarioId>`, 5 minutos) para leerlo en desarrollo con
 * redis-cli o desde las pruebas. Sin log ni endpoint; la configuración impide usarlo en producción
 * (FR-031).
 */
export class EnviadorOtpSimulado implements EnviadorOTP {
  readonly canal = 'SIMULADO' as const;

  constructor(private readonly redis: Redis) {}

  async enviar(_destino: Celular, codigo: string, usuarioId: string): Promise<void> {
    try {
      await this.redis.set(`dev:otp:${usuarioId}`, codigo, 'EX', VIDA_SEGUNDOS);
    } catch {
      throw new ErrorEnvioOtp();
    }
  }
}
