/** Clasificación de una receta que no forma parte de la ficha pública (funcionalidad 005). */
export interface ClasificacionReceta {
  readonly esCesionario: boolean;
  readonly esCorporativa: boolean;
}

/**
 * Puerto: lee `es_cesionario` y `es_corporativa`. Los usa Trámites para saber entre qué licencias
 * puede corregir el riesgo el evaluador (FR-003 de la 005). `null` si la receta no existe.
 */
export interface LectorClasificacionRecetas {
  obtener(codigo: string): Promise<ClasificacionReceta | null>;
}
