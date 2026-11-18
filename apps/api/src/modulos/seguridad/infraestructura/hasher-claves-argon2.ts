import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { HasherClaves } from '../dominio/puertos/hasher-claves';

/**
 * Huellas argon2id con los parámetros por defecto de la librería (research.md §R-02). La huella
 * ficticia se calcula una sola vez, con una clave aleatoria que nadie conoce.
 */
export class HasherClavesArgon2 implements HasherClaves {
  private huellaFicticia: Promise<string> | undefined;

  huella(clave: string): Promise<string> {
    return argon2.hash(clave, { type: argon2.argon2id });
  }

  async verificar(clave: string, huella: string): Promise<boolean> {
    try {
      return await argon2.verify(huella, clave);
    } catch {
      // Huella mal formada: se trata igual que una clave incorrecta.
      return false;
    }
  }

  async verificarContraFicticia(clave: string): Promise<boolean> {
    this.huellaFicticia ??= this.huella(randomBytes(32).toString('base64url'));
    await this.verificar(clave, await this.huellaFicticia);
    return false;
  }
}
