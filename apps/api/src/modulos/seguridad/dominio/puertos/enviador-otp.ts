import type { Celular } from '../celular';

/** Falló el envío del código: el usuario puede pedir otro y el intento no cuenta como fallido. */
export class ErrorEnvioOtp extends Error {
  constructor() {
    super('No se pudo enviar el código');
    this.name = 'ErrorEnvioOtp';
  }
}

/**
 * Envío del código de un solo uso (FR-030). Mientras no haya proveedor de SMS se usa el envío
 * simulado; cambiarlo no toca los casos de uso (SC-011).
 */
export interface EnviadorOTP {
  enviar(destino: Celular, codigo: string, usuarioId: string): Promise<void>;
}
