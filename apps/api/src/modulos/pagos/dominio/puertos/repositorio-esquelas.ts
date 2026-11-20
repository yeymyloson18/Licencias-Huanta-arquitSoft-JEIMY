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

  /**
   * Corrige el recibo con un `UPDATE … WHERE numero_recibo = <anterior>` y, en la misma transacción, la
   * auditoría `CORREGIR_RECIBO` con el anterior, el nuevo y el motivo (RF24). `CAMBIO` si otra
   * corrección ganó; `RECIBO_REPETIDO` si el nuevo ya está en otra esquela.
   */
  corregirRecibo(correccion: CorreccionRecibo): Promise<ResultadoCorreccion>;

  /** Auditoría de pagos, del más reciente al más antiguo (RF25). */
  listarAuditoria(filtro: FiltroAuditoriaPagos): Promise<PaginaAuditoriaPagos>;
}

export type ResultadoCorreccion = 'CORREGIDO' | 'CAMBIO' | 'RECIBO_REPETIDO';

export interface CorreccionRecibo {
  readonly esquela: Esquela;
  readonly reciboAnterior: string;
  readonly motivo: string;
  readonly usuarioId: string;
  readonly en: Date;
}

export interface FiltroAuditoriaPagos {
  /** Inclusive. */
  readonly desde: Date | null;
  /** Exclusivo. */
  readonly hasta: Date | null;
  readonly pagina: number;
  readonly porPagina: number;
}

export interface RegistroAuditoriaPago {
  readonly usuarioId: string;
  readonly accion: string;
  readonly codigoEsquela: string;
  readonly reciboAnterior: string | null;
  readonly reciboNuevo: string;
  readonly motivo: string | null;
  readonly ocurridoEn: Date;
}

export interface PaginaAuditoriaPagos {
  readonly total: number;
  readonly datos: readonly RegistroAuditoriaPago[];
}
