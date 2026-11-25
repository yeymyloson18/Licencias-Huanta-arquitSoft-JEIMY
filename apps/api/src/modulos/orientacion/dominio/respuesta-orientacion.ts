// Resultado del chat de orientación (012, data-model.md). Tipos puros del dominio.

/** Lo que ve el administrado (contrato: `ResultadoOrientacion`). */
export type ResultadoOrientacion =
  'RESPONDIDA' | 'SIN_INFORMACION' | 'FUERA_DE_TEMA' | 'CONSULTA_TRAMITE' | 'NO_DISPONIBLE';

/** Enlaces que arma el sistema; el portal los convierte en rutas internas (nunca URLs del modelo). */
export type TipoEnlace = 'FICHA' | 'ASISTENTE' | 'CONSULTA' | 'LICENCIAS';

export type Enlace =
  | { readonly tipo: 'FICHA'; readonly codigoReceta: string }
  | { readonly tipo: 'ASISTENTE' | 'CONSULTA' | 'LICENCIAS' };

export interface RespuestaOrientacion {
  readonly resultado: ResultadoOrientacion;
  /** Texto plano, como máximo 1,200 caracteres. */
  readonly texto: string;
  readonly enlaces: readonly Enlace[];
  /** Aclaración de FR-008, solo con RESPONDIDA. */
  readonly aclaracion: string | null;
  /** FR-016: la pregunta o el historial tenían un dato personal que se quitó. */
  readonly datoPersonalQuitado: boolean;
}

/**
 * Cómo terminó una pregunta, solo para los registros (nunca para la respuesta HTTP). Nunca lleva el
 * texto de la pregunta ni de la respuesta (FR-015).
 */
export type Desenlace =
  | 'RESPONDIDA'
  | 'SIN_INFORMACION'
  | 'FUERA_DE_TEMA'
  | 'CONSULTA_TRAMITE'
  | 'RECHAZADA_POR_REVISION'
  | 'TIEMPO_AGOTADO'
  | 'CUOTA_AGOTADA'
  | 'CLAVE_INVALIDA'
  | 'FALLA'
  | 'RESPUESTA_INVALIDA'
  | 'NO_CONFIGURADO'
  | 'CATALOGO_NO_DISPONIBLE'
  /** FR-029: pidió requisitos sin una licencia identificada; se le pregunta el tipo de negocio. */
  | 'PREGUNTA_TIPO_NEGOCIO';
