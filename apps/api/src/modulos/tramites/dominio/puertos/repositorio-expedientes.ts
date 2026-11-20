import type { EstadoExpediente } from '../estado-publico';
import type { NumeroExpediente } from '../numero-expediente';

/** Lo que la consulta pública lee de un expediente: nunca datos personales (FR-033). */
export interface ExpedienteConsultado {
  readonly numero: string;
  readonly estado: EstadoExpediente;
  readonly ruta: 'A' | 'B' | 'C';
  readonly nombreLicencia: string;
  readonly presentadoEn: Date;
  readonly vencePlazoEn: Date | null;
  /** En orden cronológico. */
  readonly historial: readonly { readonly estado: EstadoExpediente; readonly ocurridoEn: Date }[];
}

export interface RepositorioExpedientes {
  /**
   * Busca por número y por el documento (DNI, CE o RUC) del titular. El adaptador compara huellas,
   * nunca el documento en claro. `null` si no hay coincidencia.
   */
  buscarParaConsulta(
    numero: NumeroExpediente,
    documento: string,
  ): Promise<ExpedienteConsultado | null>;
}
