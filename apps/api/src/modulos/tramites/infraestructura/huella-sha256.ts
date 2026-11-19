import { createHash } from 'node:crypto';
import type { CalculadorHuella } from '../dominio/puertos/calculador-huella';

/** SHA-256 en hexadecimal (64 caracteres) de los documentos y del cuerpo de la solicitud. */
export class HuellaSha256 implements CalculadorHuella {
  sha256(datos: Uint8Array): string {
    return createHash('sha256').update(datos).digest('hex');
  }
}
