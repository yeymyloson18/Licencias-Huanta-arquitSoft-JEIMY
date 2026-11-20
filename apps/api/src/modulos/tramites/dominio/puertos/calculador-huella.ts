/**
 * Puerto: huella SHA-256 en hexadecimal (64 caracteres). La usan los documentos subidos (FR-013) y la
 * clave de idempotencia (huella del cuerpo, FR-020). El dominio no importa `node:crypto`.
 */
export interface CalculadorHuella {
  sha256(datos: Uint8Array): string;
}
