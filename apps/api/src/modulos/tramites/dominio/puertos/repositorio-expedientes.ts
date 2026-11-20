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
  /** Texto de las observaciones sin subsanar (005), de la más antigua a la más nueva. */
  readonly observacionesPendientes: readonly string[];
}

type Ruta = 'A' | 'B' | 'C';

/** Fila de la bandeja del personal (esquema `ExpedienteResumen`). */
export interface ExpedienteResumen {
  readonly numero: string;
  readonly estado: EstadoExpediente;
  readonly ruta: Ruta;
  readonly codigoReceta: string;
  readonly nombreLicencia: string;
  readonly nombreTitular: string;
  readonly giro: string;
  readonly presentadoEn: Date;
  readonly vencePlazoEn: Date | null;
}

export interface FiltroBandeja {
  readonly estado: EstadoExpediente | null;
  readonly ruta: Ruta | null;
  readonly pagina: number;
  readonly porPagina: number;
}

export interface PaginaExpedientes {
  readonly total: number;
  readonly datos: readonly ExpedienteResumen[];
}

export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO' | 'MUY_ALTO';

/** Detalle para el personal: el documento del titular llega descifrado y se enmascara al mostrarlo. */
export interface ExpedienteDetalle extends ExpedienteResumen {
  readonly version: number;
  readonly canal: 'EN_LINEA' | 'MESA_PARTES';
  readonly documentoTitular: string;
  readonly razonSocial: string | null;
  readonly nombreComercial: string | null;
  readonly direccion: string;
  readonly zona: string;
  readonly areaM2: number | null;
  readonly nivelRiesgoPropuesto: NivelRiesgo | null;
  readonly nivelRiesgoConfirmado: NivelRiesgo | null;
  /** La observación del evaluador (como máximo una, 005). */
  readonly observaciones: readonly {
    readonly descripcion: string;
    readonly plazoSubsanarEn: Date | null;
    readonly subsanadaEn: Date | null;
  }[];
  /** En el orden de la receta al presentar. */
  readonly documentos: readonly {
    readonly id: string;
    readonly requisitoId: number;
    readonly nombreOriginal: string;
    readonly tipoMime: string;
  }[];
  /** En orden cronológico. */
  readonly historial: readonly {
    readonly estadoAnterior: string | null;
    readonly estadoNuevo: string;
    readonly comentario: string | null;
    readonly ocurridoEn: Date;
  }[];
}

export interface DocumentoGuardado {
  readonly claveAlmacen: string;
  readonly nombreOriginal: string;
  readonly tipoMime: string;
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

  /** Bandeja: todos los expedientes, del más reciente al más antiguo. */
  listar(filtro: FiltroBandeja): Promise<PaginaExpedientes>;

  /**
   * Lee el detalle y, si hay `lector`, en la misma transacción registra `VER_DETALLE` en la auditoría
   * con el usuario (FR-036). Sin `lector` (respuesta de una decisión de la 005) no registra nada.
   * `null` si el número no existe (y entonces no registra nada).
   */
  obtenerDetalle(
    numero: NumeroExpediente,
    lector: { readonly usuarioId: string; readonly en: Date } | null,
  ): Promise<ExpedienteDetalle | null>;

  /** Un documento de ESE expediente; `null` si no existe o es de otro expediente. */
  buscarDocumento(numero: NumeroExpediente, documentoId: string): Promise<DocumentoGuardado | null>;
}
