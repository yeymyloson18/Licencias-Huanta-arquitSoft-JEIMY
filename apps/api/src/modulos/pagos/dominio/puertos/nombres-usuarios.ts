/** Puerto: nombres del personal para la auditoría (lo implementa un adaptador de la fachada de Seguridad). */
export interface NombresUsuarios {
  nombresDe(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
