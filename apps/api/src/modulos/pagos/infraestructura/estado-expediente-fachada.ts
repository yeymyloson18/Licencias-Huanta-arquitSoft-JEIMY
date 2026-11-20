import type { FachadaTramites } from '../../tramites/fachada';
import type { EstadoExpediente } from '../dominio/puertos/estado-expediente';

/** Adaptador del puerto `EstadoExpediente` sobre la fachada de Trámites (principio I). */
export class EstadoExpedienteFachada implements EstadoExpediente {
  constructor(private readonly tramites: FachadaTramites) {}

  estadoDe(numeroExpediente: string): Promise<string | null> {
    return this.tramites.estadoParaPago(numeroExpediente);
  }
}
