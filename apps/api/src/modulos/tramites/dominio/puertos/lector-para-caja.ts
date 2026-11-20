import type { EstadoExpediente } from '../estado-publico';

/** Lo que caja necesita del expediente (005): estado y, solo para la pantalla, el nombre del titular. */
export interface ExpedienteParaCaja {
  readonly numero: string;
  readonly estado: EstadoExpediente;
  readonly nombreTitular: string;
  readonly razonSocial: string | null;
}

/** Puerto: lectura del expediente para el módulo Pagos y la pantalla de caja. */
export interface LectorParaCaja {
  obtener(numero: string): Promise<ExpedienteParaCaja | null>;
}
