import type { BuzonPruebas } from '../../../compartido/infraestructura/buzon-pruebas';
import type { Celular } from '../dominio/celular';
import { ErrorEnvioOtp, type EnviadorOTP } from '../dominio/puertos/enviador-otp';

/**
 * Envío del código al buzón de pruebas (009, research §R-07). Decora al envío simulado: primero deja
 * el código en Redis (`dev:otp:*`, misma clave y caducidad), así las pruebas, el E2E, Postman y la
 * carga lo siguen leyendo; después lo entrega como un mensaje que se ve en la página del buzón. Si
 * falla cualquiera de los dos, lanza `ErrorEnvioOtp` (se devuelve el cupo de envíos, como hoy).
 */
export class EnviadorOtpBuzon implements EnviadorOTP {
  constructor(
    private readonly simulado: EnviadorOTP,
    private readonly buzon: Pick<BuzonPruebas, 'enviar'>,
  ) {}

  async enviar(destino: Celular, codigo: string, usuarioId: string): Promise<void> {
    await this.simulado.enviar(destino, codigo, usuarioId);
    try {
      await this.buzon.enviar({
        asunto: `Código de verificación para ${destino.enmascarado()}`,
        texto: `Su código de verificación es ${codigo}.\n\nVence en 5 minutos. No lo comparta con nadie.`,
      });
    } catch {
      throw new ErrorEnvioOtp();
    }
  }
}
