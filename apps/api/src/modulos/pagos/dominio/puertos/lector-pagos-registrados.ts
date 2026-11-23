/** Pago registrado en caja para el tablero de la jefatura (007): sin datos personales. */
export interface PagoRegistrado {
  readonly codigoReceta: string;
  /** Monto en soles con 2 decimales (`"177.10"`). */
  readonly monto: string;
  readonly pagadaEn: Date;
}

/** Puerto: pagos registrados con `pagada_en` en `[desde, hasta)` (007). */
export interface LectorPagosRegistrados {
  pagadasEntre(desde: Date, hasta: Date): Promise<PagoRegistrado[]>;
}
