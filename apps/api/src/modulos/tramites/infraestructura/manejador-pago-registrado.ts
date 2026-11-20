import { z } from 'zod';
import type { AplicarPagoRegistrado } from '../aplicacion/aplicar-pago-registrado';

/** El evento no tiene la forma esperada; el despachador lo reintenta y avisa cada 10 fallos. */
export class ErrorEventoPagoInvalido extends Error {
  constructor() {
    super('Evento PagoRegistrado inválido');
    this.name = 'ErrorEventoPagoInvalido';
  }
}

const esquemaEvento = z.object({ numeroExpediente: z.string(), codigoEsquela: z.string() });

/** Manejador del despachador para `PagoRegistrado` (research §R-06 de la 005). */
export const manejadorPagoRegistrado =
  (aplicar: AplicarPagoRegistrado) =>
  async (datos: unknown): Promise<void> => {
    const evento = esquemaEvento.safeParse(datos);
    if (!evento.success) {
      throw new ErrorEventoPagoInvalido();
    }
    await aplicar.ejecutar(evento.data);
  };
