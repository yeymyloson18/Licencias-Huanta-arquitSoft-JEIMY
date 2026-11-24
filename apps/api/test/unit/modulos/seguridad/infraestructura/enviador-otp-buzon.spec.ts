import { Celular } from '../../../../../src/modulos/seguridad/dominio/celular';
import { ErrorEnvioOtp } from '../../../../../src/modulos/seguridad/dominio/puertos/enviador-otp';
import { EnviadorOtpBuzon } from '../../../../../src/modulos/seguridad/infraestructura/enviador-otp-buzon';

const celular = Celular.crear('987654321');

const preparar = (fallaSimulado = false, fallaBuzon = false) => {
  const simulados: string[] = [];
  const mensajes: { asunto: string; texto: string }[] = [];
  const enviador = new EnviadorOtpBuzon(
    {
      enviar: (_destino, codigo) => {
        if (fallaSimulado) {
          return Promise.reject(new ErrorEnvioOtp());
        }
        simulados.push(codigo);
        return Promise.resolve();
      },
    },
    {
      enviar: (mensaje) => {
        if (fallaBuzon) {
          return Promise.reject(new Error('ECONNREFUSED'));
        }
        mensajes.push(mensaje);
        return Promise.resolve();
      },
    },
  );
  return { simulados, mensajes, enviador };
};

describe('EnviadorOtpBuzon (009)', () => {
  it('deja el código como el simulado y lo entrega al buzón con el celular enmascarado', async () => {
    const { simulados, mensajes, enviador } = preparar();

    await enviador.enviar(celular, '123456', 'usuario-1');

    expect(simulados).toEqual(['123456']);
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]?.asunto).toBe('Código de verificación para 9*****321');
    expect(mensajes[0]?.asunto).not.toContain('987654321');
    expect(mensajes[0]?.texto).toContain('123456');
  });

  it('si el buzón no responde, lanza ErrorEnvioOtp', async () => {
    const { enviador } = preparar(false, true);

    await expect(enviador.enviar(celular, '123456', 'usuario-1')).rejects.toBeInstanceOf(
      ErrorEnvioOtp,
    );
  });

  it('si falla el simulado, no envía al buzón', async () => {
    const { mensajes, enviador } = preparar(true);

    await expect(enviador.enviar(celular, '123456', 'usuario-1')).rejects.toBeInstanceOf(
      ErrorEnvioOtp,
    );
    expect(mensajes).toEqual([]);
  });
});
