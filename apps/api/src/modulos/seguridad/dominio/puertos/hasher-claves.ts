/** Huellas irreversibles de las claves (argon2id, research.md §R-02). Nunca guarda la clave. */
export interface HasherClaves {
  huella(clave: string): Promise<string>;
  verificar(clave: string, huella: string): Promise<boolean>;
  /**
   * Verifica contra una huella ficticia y siempre devuelve `false`. Se usa cuando el correo no
   * existe, para que el tiempo de respuesta no revele si el usuario existe (FR-005).
   */
  verificarContraFicticia(clave: string): Promise<boolean>;
}
