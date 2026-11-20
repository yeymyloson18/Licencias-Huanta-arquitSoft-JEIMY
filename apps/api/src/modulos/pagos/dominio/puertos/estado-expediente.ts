/** Puerto: estado del expediente de una esquela (lo implementa un adaptador de la fachada de Trámites). */
export interface EstadoExpediente {
  /** `null` si el expediente no existe. */
  estadoDe(numeroExpediente: string): Promise<string | null>;
}
