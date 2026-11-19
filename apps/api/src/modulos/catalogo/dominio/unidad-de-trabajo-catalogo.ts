import type { DiferenciaReceta } from './diferencia-receta';
import type { RecetaCompleta } from './receta-completa';

/** Lo que hay que escribir cuando el trabajo encontró cambios reales. */
export interface GuardadoReceta {
  readonly receta: RecetaCompleta;
  readonly diferencias: DiferenciaReceta;
  /** Identificador interno del administrador (sin datos personales, FR-026). */
  readonly usuarioId: string;
  readonly en: Date;
}

export interface TrabajoReceta<T> {
  /** `null` = no hubo cambios: no se escribe nada (FR-022). */
  readonly guardar: GuardadoReceta | null;
  readonly resultado: T;
}

export interface ResultadoUnidadDeTrabajo<T> {
  /** La receta tal como quedó al confirmar (con los `id` de los requisitos nuevos). */
  readonly receta: RecetaCompleta;
  readonly resultado: T;
}

/**
 * Puerto: edición atómica de una receta (research §R-05 de la 003). Bloquea la receta, le pasa el
 * estado guardado en ese momento al trabajo y, si este pide guardar, escribe la receta, sus
 * requisitos y el registro de cambios en la misma transacción. Si el trabajo lanza o algo falla, no
 * queda nada. Devuelve `null` si la receta no existe.
 */
export interface UnidadDeTrabajoCatalogo {
  ejecutar<T>(
    codigo: string,
    trabajo: (receta: RecetaCompleta) => TrabajoReceta<T>,
  ): Promise<ResultadoUnidadDeTrabajo<T> | null>;
}
