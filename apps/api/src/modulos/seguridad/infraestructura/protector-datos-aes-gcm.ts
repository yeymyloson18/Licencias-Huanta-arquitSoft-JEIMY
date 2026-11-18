import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { ProtectorDatos } from '../dominio/puertos/protector-datos';

const ALGORITMO = 'aes-256-gcm';
const BYTES_IV = 12;
const BYTES_TAG = 16;

/**
 * Cifra datos personales con AES-256-GCM (IV aleatorio de 12 bytes; se guarda `iv ‖ tag ‖ texto`)
 * y calcula HMAC-SHA256 para buscarlos por igualdad (MD3, research.md §R-04).
 */
export class ProtectorDatosAesGcm implements ProtectorDatos {
  constructor(
    private readonly claveCifrado: Buffer,
    private readonly claveHmac: Buffer,
  ) {
    if (claveCifrado.length !== 32) {
      throw new Error('La clave de cifrado debe tener 32 bytes');
    }
  }

  cifrar(texto: string): Uint8Array {
    const iv = randomBytes(BYTES_IV);
    const cifrador = createCipheriv(ALGORITMO, this.claveCifrado, iv);
    const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
    return Buffer.concat([iv, cifrador.getAuthTag(), cifrado]);
  }

  descifrar(datos: Uint8Array): string {
    const bytes = Buffer.from(datos);
    const iv = bytes.subarray(0, BYTES_IV);
    const tag = bytes.subarray(BYTES_IV, BYTES_IV + BYTES_TAG);
    const cifrado = bytes.subarray(BYTES_IV + BYTES_TAG);
    const descifrador = createDecipheriv(ALGORITMO, this.claveCifrado, iv);
    descifrador.setAuthTag(tag);
    return Buffer.concat([descifrador.update(cifrado), descifrador.final()]).toString('utf8');
  }

  hmac(texto: string): Uint8Array {
    return createHmac('sha256', this.claveHmac).update(texto, 'utf8').digest();
  }
}
