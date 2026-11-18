/**
 * Puerto: borra de la caché la ficha de la receta y las listas públicas (research §R-06 de la 003).
 * Nunca lanza: si la caché falla, el TTL de 240 s pone el límite.
 */
export interface InvalidadorCacheCatalogo {
  invalidar(codigo: string): Promise<void>;
}
