import type { Esquela } from '../esquela';

export type ResultadoRegistroPago = 'REGISTRADO' | 'YA_PAGADA' | 'RECIBO_REPETIDO';

/** Puerto: `pagos.esquela` y su auditoría. */
export interface RepositorioEsquelas {
  /**
   * Inserta la esquela si el expediente todavía no tiene una (`numero_expediente` es único, ADR-004).
   * Devuelve `false` si ya existía: generar dos veces no duplica (idempotente).
   */
  crearSiNoExiste(esquela: Esquela): Promise<boolean>;

  obtener(codigo: string): Promise<Esquela | null>;

  /**
   * Guarda el pago con un `UPDATE … WHERE numero_recibo IS NULL` y, en la misma transacción, la
   * auditoría `REGISTRAR_PAGO` y el evento `PagoRegistrado` (research §R-06). `YA_PAGADA` si otro pago
   * ganó; `RECIBO_REPETIDO` si el recibo ya está en otra esquela. En ambos casos no escribe nada.
   */
  registrarPago(esquelaPagada: Esquela): Promise<ResultadoRegistroPago>;
}
