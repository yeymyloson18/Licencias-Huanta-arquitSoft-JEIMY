import { z } from 'zod';
import type { AplicarLicenciaEmitida } from '../aplicacion/aplicar-licencia-emitida';
import type { AplicarResultadoItse } from '../aplicacion/aplicar-resultado-itse';

/** El evento no tiene la forma esperada; el despachador lo reintenta y avisa cada 10 fallos. */
export class ErrorEventoInvalidoTramites extends Error {
  constructor(tipo: string) {
    super(`Evento ${tipo} inválido`);
    this.name = 'ErrorEventoInvalidoTramites';
  }
}

const NUMERO_EXPEDIENTE = z.string().regex(/^EXP-[0-9]{4}-[0-9]{6}$/);

const esquemaLicenciaEmitida = z.object({
  numeroExpediente: NUMERO_EXPEDIENTE,
  numeroLicencia: z.string().regex(/^LF-[0-9]{4}-[0-9]{6}$/),
});

/** `LicenciaEmitida` → el expediente avanza según su ruta (research §R-01 de la 006). */
export const manejadorLicenciaEmitida =
  (aplicar: AplicarLicenciaEmitida) =>
  async (datos: unknown): Promise<void> => {
    const evento = esquemaLicenciaEmitida.safeParse(datos);
    if (!evento.success) {
      throw new ErrorEventoInvalidoTramites('LicenciaEmitida');
    }
    await aplicar.ejecutar(evento.data);
  };

const esquemaResultadoItse = z.object({
  numeroExpediente: NUMERO_EXPEDIENTE,
  inspeccionId: z.uuid(),
});

/** `ResultadoITSERegistrado` → el expediente avanza según el tipo y el resultado (research §R-01). */
export const manejadorResultadoItse =
  (aplicar: AplicarResultadoItse) =>
  async (datos: unknown): Promise<void> => {
    const evento = esquemaResultadoItse.safeParse(datos);
    if (!evento.success) {
      throw new ErrorEventoInvalidoTramites('ResultadoITSERegistrado');
    }
    await aplicar.ejecutar(evento.data);
  };
