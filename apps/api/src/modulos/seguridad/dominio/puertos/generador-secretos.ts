/** Valores aleatorios y huellas criptográficas (research.md §R-03 y §R-05). */
export interface GeneradorSecretos {
  /** Identificador único (UUID v4). */
  generarId(): string;
  /** Código de exactamente 6 dígitos, con ceros a la izquierda. */
  codigoOtp(): string;
  /** Refresh token opaco `<sesionId>.<32 bytes aleatorios en base64url>`. */
  refreshToken(sesionId: string): string;
  /** HMAC del código ligado a su desafío: quien robe la tabla no puede probar los 10⁶ códigos. */
  hmacCodigo(desafioId: string, codigo: string): string;
  /** SHA-256 en hexadecimal (para el refresh token, que ya tiene alta entropía). */
  sha256(texto: string): string;
  /** Compara dos textos en tiempo constante. */
  igualesEnTiempoConstante(a: string, b: string): boolean;
}
