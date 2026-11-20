import { Esquela } from '../dominio/esquela';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioEsquelas } from '../dominio/puertos/repositorio-esquelas';

/** Datos del evento `EsquelaSolicitada` que escribe Trámites al confirmar el riesgo. */
export interface EsquelaSolicitada {
  readonly numeroExpediente: string;
  readonly codigoReceta: string;
  readonly concepto: string;
  readonly monto: string;
}

/**
 * Genera la esquela de un expediente al consumir `EsquelaSolicitada` (CU14 de la 005, research §R-01).
 * Idempotente: si el evento llega dos veces, la segunda no crea otra esquela.
 */
export class GenerarEsquela {
  constructor(
    private readonly dependencias: {
      readonly esquelas: Pick<RepositorioEsquelas, 'crearSiNoExiste'>;
      readonly reloj: Reloj;
    },
  ) {}

  async ejecutar(solicitud: EsquelaSolicitada): Promise<{ readonly creada: boolean }> {
    const esquela = Esquela.generar({ ...solicitud, en: this.dependencias.reloj.ahora() });
    return { creada: await this.dependencias.esquelas.crearSiNoExiste(esquela) };
  }
}
