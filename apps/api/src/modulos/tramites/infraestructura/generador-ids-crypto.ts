import { randomUUID } from 'node:crypto';
import type { GeneradorIds } from '../dominio/puertos/generador-ids';

export class GeneradorIdsCrypto implements GeneradorIds {
  generarId(): string {
    return randomUUID();
  }
}
