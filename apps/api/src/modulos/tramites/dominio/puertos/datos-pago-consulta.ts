/** Lo que la consulta pública muestra de la esquela (sin datos personales). */
export interface EsquelaParaConsulta {
  readonly codigo: string;
  readonly monto: string;
  readonly pagada: boolean;
}

/**
 * Puerto: datos de pago para la consulta pública (005). La esquela llega por la fachada de Pagos y el
 * `tokenConsulta` por la de Seguridad (principio I: solo por fachadas).
 */
export interface DatosPagoConsulta {
  esquelaDe(numeroExpediente: string): Promise<EsquelaParaConsulta | null>;
  tokenConsulta(
    numeroExpediente: string,
  ): Promise<{ readonly token: string; readonly expiraEn: number }>;
}
