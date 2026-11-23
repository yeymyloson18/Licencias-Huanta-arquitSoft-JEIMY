// Fachada pública del módulo Pagos: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

import { codigoEsquelaDe } from './dominio/esquela';
import {
  type Fecha,
  fechaLima,
  inicioDiaLima,
  sumarDias,
} from '../../compartido/dominio/fecha-lima';
import type { LectorPagosRegistrados } from './dominio/puertos/lector-pagos-registrados';
import type { RepositorioEsquelas } from './dominio/puertos/repositorio-esquelas';

/** Pago registrado en caja (tablero de la jefatura, 007). */
export interface PagoRegistradoDto {
  readonly codigoReceta: string;
  readonly monto: string;
  readonly pagadoEn: Fecha;
}

/** Esquela de un expediente, sin datos personales (consulta pública de la 005). */
export interface EsquelaDelExpedienteDto {
  readonly codigo: string;
  readonly monto: string;
  readonly pagada: boolean;
}

/** Operaciones de Pagos que usan otros módulos (por ahora, Trámites). */
export class FachadaPagos {
  constructor(
    private readonly esquelas: Pick<RepositorioEsquelas, 'obtener'>,
    private readonly pagos?: LectorPagosRegistrados,
  ) {}

  /** Pagos registrados entre dos días de Lima, ambos incluidos (tablero, 007). */
  async pagosRegistrados(desde: Fecha, hasta: Fecha): Promise<PagoRegistradoDto[]> {
    if (this.pagos === undefined) {
      throw new Error('La fachada de Pagos no tiene el lector de pagos');
    }
    const filas = await this.pagos.pagadasEntre(
      inicioDiaLima(desde),
      inicioDiaLima(sumarDias(hasta, 1)),
    );
    return filas.map((fila) => ({
      codigoReceta: fila.codigoReceta,
      monto: fila.monto,
      pagadoEn: fechaLima(fila.pagadaEn),
    }));
  }

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
