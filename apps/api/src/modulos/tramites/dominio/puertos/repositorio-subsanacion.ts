import type { EstadoExpediente } from '../estado-publico';
import type { Ruta } from '../maquina-estados';

/** Lo que la subsanación necesita del expediente (005). Sin datos personales. */
export interface ExpedienteParaSubsanar {
  readonly id: string;
  readonly numero: string;
  readonly estado: EstadoExpediente;
  readonly version: number;
  readonly ruta: Ruta;
  readonly codigoReceta: string;
  readonly nombreLicencia: string;
  readonly canal: 'EN_LINEA' | 'MESA_PARTES';
  readonly presentadoEn: Date;
  readonly vencePlazoEn: Date | null;
  /** Requisitos de la receta guardada al presentar: solo a ellos se puede adjuntar. */
  readonly requisitos: readonly { readonly id: number; readonly orden: number }[];
}

export interface Subsanacion {
  readonly expedienteId: string;
  readonly numero: string;
  readonly versionEsperada: number;
  readonly documentos: readonly {
    readonly documentoId: string;
    readonly requisitoId: number;
    readonly requisitoOrden: number;
  }[];
  /** `null` = el titular en línea; si no, el usuario de mesa de partes. */
  readonly usuarioId: string | null;
  readonly en: Date;
}

/**
 * Puerto de la subsanación (historia 4 de la 005). `subsanar` hace, en una sola transacción, el paso
 * OBSERVADO → EN_EVALUACION (condicionado a la versión), mueve los documentos temporales al
 * expediente, marca la observación como subsanada y escribe historial, auditoría y evento.
 */
export interface RepositorioSubsanacion {
  obtener(numero: string): Promise<ExpedienteParaSubsanar | null>;
  /** ¿El documento (DNI, CE o RUC) es el del titular? Compara huellas: nunca lee el dato en claro. */
  esDelTitular(numero: string, documento: string): Promise<boolean>;
  subsanar(datos: Subsanacion): Promise<'SUBSANADO' | 'CAMBIO' | 'DOCUMENTOS_NO_DISPONIBLES'>;
}
