// Fachada pública del módulo Trámites: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

import type { EstadoExpediente } from './dominio/estado-publico';
import type { LectorParaCaja } from './dominio/puertos/lector-para-caja';

export type { EstadoExpediente } from './dominio/estado-publico';

/** Operaciones de Trámites que usan otros módulos (por ahora, Pagos). Sin datos personales. */
export class FachadaTramites {
  constructor(private readonly lector: LectorParaCaja) {}

  /** Estado del expediente para decidir si se puede pagar su esquela (FR-024 de la 005). */
  async estadoParaPago(numeroExpediente: string): Promise<EstadoExpediente | null> {
    return (await this.lector.obtener(numeroExpediente))?.estado ?? null;
  }
}
