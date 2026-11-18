import type Redis from 'ioredis';
import { Celular } from '../../../../../src/modulos/seguridad/dominio/celular';
import { ErrorEnvioOtp } from '../../../../../src/modulos/seguridad/dominio/puertos/enviador-otp';
import { EnviadorOtpSimulado } from '../../../../../src/modulos/seguridad/infraestructura/enviador-otp-simulado';

const redisFalso = (falla = false) => {
  const llamadas: unknown[][] = [];
  const redis = {
    set: (...argumentos: unknown[]) => {
      llamadas.push(argumentos);
      return falla ? Promise.reject(new Error('redis caído')) : Promise.resolve('OK');
    },
  } as unknown as Redis;
  return { redis, llamadas };
};

describe('EnviadorOtpSimulado', () => {
  it('guarda el código en dev:otp:<usuarioId> con 300 s de vida', async () => {
    const { redis, llamadas } = redisFalso();

    await new EnviadorOtpSimulado(redis).enviar(Celular.crear('987654321'), '012345', 'u-1');

    expect(llamadas).toEqual([['dev:otp:u-1', '012345', 'EX', 300]]);
  });

  it('no guarda el celular', async () => {
    const { redis, llamadas } = redisFalso();

    await new EnviadorOtpSimulado(redis).enviar(Celular.crear('987654321'), '012345', 'u-1');

    expect(JSON.stringify(llamadas)).not.toContain('987654321');
  });

  it('si Redis falla lanza ErrorEnvioOtp', async () => {
    const { redis } = redisFalso(true);

    await expect(
      new EnviadorOtpSimulado(redis).enviar(Celular.crear('987654321'), '012345', 'u-1'),
    ).rejects.toBeInstanceOf(ErrorEnvioOtp);
  });
});
