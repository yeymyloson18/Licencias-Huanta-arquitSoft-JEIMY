// Puerto compartido (research §R-06 de la 004): lo usan seguridad y trámites; vive en `compartido`
// para que ningún módulo importe el interior de otro.

/** Cifrado de datos personales y HMAC para buscarlos sin descifrar (MD3, research.md §R-04). */
export interface ProtectorDatos {
  cifrar(texto: string): Uint8Array;
  descifrar(datos: Uint8Array): string;
  /** HMAC determinista del texto: permite buscar por igualdad exacta. */
  hmac(texto: string): Uint8Array;
}
