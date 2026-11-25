import type { TipoEnlace } from './respuesta-orientacion';

// Puertos del módulo Orientación (012, data-model.md). Los adaptadores viven en infraestructura/: el
// catálogo se lee solo por la fachada del módulo Catálogo (con su caché) y el proveedor externo de IA
// con fetch (ADR-011).

/** Licencia vigente, con los datos públicos que puede usar el chat (copiados del catálogo). */
export interface LicenciaVigente {
  readonly codigo: string;
  readonly nombre: string;
  readonly ruta: 'A' | 'B' | 'C';
  /** Soles con dos decimales, por ejemplo "177.10". */
  readonly tasa: string;
  readonly plazoDias: number | null;
  readonly tipoPlazo: 'HABILES' | 'CALENDARIO';
  readonly calificacion:
    'APROBACION_AUTOMATICA' | 'EVALUACION_PREVIA_SILENCIO_POSITIVO' | 'SERVICIO_EXCLUSIVO';
  readonly ordenItse: 'POSTERIOR' | 'PREVIA' | 'DENTRO_6_MESES' | null;
  readonly plazoItseDias: number | null;
  readonly vigenciaMeses: number | null;
  /** Descripciones de los requisitos, en el orden del catálogo. */
  readonly requisitos: readonly string[];
}

/** Tema de la guía de preguntas frecuentes (research R-03). */
export interface TemaGuia {
  readonly id: string;
  readonly titulo: string;
  readonly palabrasClave: readonly string[];
  readonly respuesta: string;
  readonly enlaces: readonly TipoEnlace[];
}

export interface FuenteCatalogo {
  /** Las licencias activas que se pueden presentar hoy. */
  licenciasVigentes(): Promise<readonly LicenciaVigente[]>;
}

export interface FuenteGuia {
  temas(): readonly TemaGuia[];
}

/** Mensaje hacia el proveedor (formato de chat). Nunca lleva datos personales. */
export interface MensajeProveedor {
  readonly rol: 'system' | 'user' | 'assistant';
  readonly contenido: string;
}

export type FallaProveedor =
  | 'TIEMPO_AGOTADO'
  | 'CUOTA_AGOTADA'
  | 'CLAVE_INVALIDA'
  | 'FALLA'
  | 'RESPUESTA_INVALIDA'
  | 'NO_CONFIGURADO';

export type ResultadoProveedor =
  { readonly tipo: 'OK'; readonly contenido: string } | { readonly tipo: FallaProveedor };

export interface ProveedorOrientacion {
  responder(mensajes: readonly MensajeProveedor[]): Promise<ResultadoProveedor>;
}

export interface ReservaPregunta {
  readonly permitido: boolean;
  /** Segundos hasta que vence la ventana (para `Retry-After`); 0 si está permitido. */
  readonly segundosRestantes: number;
}

export interface LimitadorPreguntas {
  /** Cuenta una pregunta de esta huella (nunca la IP). */
  reservar(huella: string): Promise<ReservaPregunta>;
}

export interface Reloj {
  /** Milisegundos desde la época. */
  ahora(): number;
}
