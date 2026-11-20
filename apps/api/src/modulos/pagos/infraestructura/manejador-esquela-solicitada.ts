import { z } from 'zod';
import type { GenerarEsquela } from '../aplicacion/generar-esquela';

/** El evento no tiene la forma esperada; se reintenta y deja un aviso cada 10 fallos. */
export class ErrorEventoInvalido extends Error {
  constructor() {
    super('Evento EsquelaSolicitada inválido');
    this.name = 'ErrorEventoInvalido';
  }
}

const esquemaEvento = z.object({
  numeroExpediente: z.string(),
  codigoReceta: z.string(),
  concepto: z.string(),
  monto: z.string(),
});

/** Manejador del despachador para `EsquelaSolicitada` (research §R-01 de la 005). */
export const manejadorEsquelaSolicitada =
  (generar: GenerarEsquela) =>
  async (datos: unknown): Promise<void> => {
    const evento = esquemaEvento.safeParse(datos);
    if (!evento.success) {
      throw new ErrorEventoInvalido();
    }
    await generar.ejecutar(evento.data);
  };
