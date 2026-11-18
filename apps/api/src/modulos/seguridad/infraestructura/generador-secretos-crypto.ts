import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { GeneradorSecretos } from '../dominio/puertos/generador-secretos';

const UN_MILLON = 1_000_000;

/** Valores aleatorios y huellas con `node:crypto` (research.md §R-03 y §R-05). */
export class GeneradorSecretosCrypto implements GeneradorSecretos {
  constructor(
    private readonly claveHmac: Buffer,
    /** Fuente del número del código; solo se reemplaza en pruebas. */
    private readonly numeroAleatorio: () => number = () => randomInt(0, UN_MILLON),
  ) {}

  generarId(): string {
    return randomUUID();
  }

  codigoOtp(): string {
    return String(this.numeroAleatorio()).padStart(6, '0');
  }

  refreshToken(sesionId: string): string {
    return `${sesionId}.${randomBytes(32).toString('base64url')}`;
  }

  hmacCodigo(desafioId: string, codigo: string): string {
    return createHmac('sha256', this.claveHmac).update(`${desafioId}:${codigo}`).digest('hex');
  }

  sha256(texto: string): string {
    return createHash('sha256').update(texto, 'utf8').digest('hex');
  }

  igualesEnTiempoConstante(a: string, b: string): boolean {
    // Se comparan las huellas SHA-256 para que la longitud distinta no corte antes la comparación.
    const huellaA = createHash('sha256').update(a, 'utf8').digest();
    const huellaB = createHash('sha256').update(b, 'utf8').digest();
    return timingSafeEqual(huellaA, huellaB) && a.length === b.length;
  }
}
