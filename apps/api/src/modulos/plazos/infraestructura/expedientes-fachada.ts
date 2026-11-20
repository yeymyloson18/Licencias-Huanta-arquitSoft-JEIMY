import type { FachadaTramites } from '../../tramites/fachada';
import type { ExpedientesConPlazo } from '../dominio/puertos';

/** Adaptador de `ExpedientesConPlazo` sobre la fachada de Trámites (principio I). */
export class ExpedientesFachadaTramites implements ExpedientesConPlazo {
  constructor(private readonly tramites: FachadaTramites) {}

  completarVencimientos(): Promise<number> {
    return this.tramites.completarVencimientos();
  }

  conPlazo() {
    return this.tramites.expedientesConPlazo();
  }

  estadosDe(numeros: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.tramites.estadosDe(numeros);
  }
}
