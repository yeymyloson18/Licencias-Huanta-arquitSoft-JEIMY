/** Puerto: nombres del personal para mostrarlos en la auditoría (RF25). Solo el nombre, nada más. */
export interface LectorNombresUsuarios {
  nombres(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
