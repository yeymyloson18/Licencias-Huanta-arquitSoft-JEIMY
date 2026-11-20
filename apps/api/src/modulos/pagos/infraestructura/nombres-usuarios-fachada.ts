import type { FachadaSeguridad } from '../../seguridad/fachada';
import type { NombresUsuarios } from '../dominio/puertos/nombres-usuarios';

/** Adaptador de `NombresUsuarios` sobre la fachada de Seguridad (principio I). */
export class NombresUsuariosFachada implements NombresUsuarios {
  constructor(private readonly seguridad: FachadaSeguridad) {}

  nombresDe(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.seguridad.nombresDeUsuarios(ids);
  }
}
