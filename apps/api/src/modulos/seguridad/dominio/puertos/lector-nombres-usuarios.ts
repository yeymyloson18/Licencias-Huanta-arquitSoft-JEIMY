/** Puerto: nombres del personal para mostrarlos en la auditoría (RF25). Solo el nombre, nada más. */
export interface LectorNombresUsuarios {
  nombres(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** Usuarios activos con ese rol vigente, por nombre (para asignar inspectores, 006). */
  activosConRol(rol: string): Promise<readonly { readonly id: string; readonly nombre: string }[]>;
}
