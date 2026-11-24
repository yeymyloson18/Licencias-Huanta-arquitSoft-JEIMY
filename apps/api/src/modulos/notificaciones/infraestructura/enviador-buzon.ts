import { enmascararDestino } from '../../../compartido/dominio/destino-enmascarado';
import type { BuzonPruebas } from '../../../compartido/infraestructura/buzon-pruebas';
import type { Canal } from '../dominio/aviso';
import type { EnviadorMensajes } from '../dominio/puertos';

/**
 * Avisos al administrado en el buzón de pruebas (009, research §R-07). Decora al enviador simulado
 * (que deja el aviso en Redis) y entrega el mismo texto como un mensaje con el destino enmascarado.
 */
export class EnviadorBuzon implements EnviadorMensajes {
  constructor(
    private readonly simulado: EnviadorMensajes,
    private readonly buzon: Pick<BuzonPruebas, 'enviar'>,
  ) {}

  async enviar(mensaje: {
    readonly id: string;
    readonly canal: Canal;
    readonly destino: string;
    readonly texto: string;
  }): Promise<void> {
    await this.simulado.enviar(mensaje);
    const medio = mensaje.canal === 'SMS' ? 'SMS' : 'correo';
    await this.buzon.enviar({
      asunto: `Aviso de su trámite (${medio}) para ${enmascararDestino(mensaje.canal, mensaje.destino)}`,
      texto: mensaje.texto,
    });
  }
}
