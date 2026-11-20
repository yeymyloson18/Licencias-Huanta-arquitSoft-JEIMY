// Fachada pública del módulo Pagos: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

import { codigoEsquelaDe } from './dominio/esquela';
import type { RepositorioEsquelas } from './dominio/puertos/repositorio-esquelas';

/** Esquela de un expediente, sin datos personales (consulta pública de la 005). */
export interface EsquelaDelExpedienteDto {
  readonly codigo: string;
  readonly monto: string;
  readonly pagada: boolean;
}

/** Operaciones de Pagos que usan otros módulos (por ahora, Trámites). */
export class FachadaPagos {
  constructor(private readonly esquelas: Pick<RepositorioEsquelas, 'obtener'>) {}

  /** `null` si la esquela todavía no existe (se genera por la cola de eventos, research §R-01). */
  async esquelaDelExpediente(numeroExpediente: string): Promise<EsquelaDelExpedienteDto | null> {
    const esquela = await this.esquelas.obtener(codigoEsquelaDe(numeroExpediente));
    if (esquela === null) {
      return null;
    }
    const datos = esquela.aDatos();
    return { codigo: datos.codigo, monto: datos.monto, pagada: datos.pago !== null };
  }
}
