import type { ReglaClaveIncumplida } from '../dominio/politica-clave';

/**
 * Credenciales, código o sesión no válidos. Es un único error a propósito: nunca indica qué dato
 * falló (correo, clave, código, usuario inactivo o sesión revocada; FR-005).
 */
export class ErrorAutenticacion extends Error {
  constructor() {
    super('No autenticado');
    this.name = 'ErrorAutenticacion';
  }
}

/** La clave nueva no cumple la política (FR-022a). Lleva las reglas, nunca la clave. */
export class ErrorClaveInvalida extends Error {
  constructor(readonly reglas: readonly ReglaClaveIncumplida[]) {
    super('La clave no cumple la política');
    this.name = 'ErrorClaveInvalida';
  }
}

/** Datos con formato inválido. Lleva solo los nombres de los campos, nunca sus valores (FR-029). */
export class ErrorDatosInvalidos extends Error {
  constructor(readonly campos: readonly string[]) {
    super(`Datos inválidos: ${campos.join(', ')}`);
    this.name = 'ErrorDatosInvalidos';
  }
}

/** Se superó un límite de intentos (FR-002a, FR-006, FR-007): se puede reintentar en `segundos`. */
export class ErrorDemasiadosIntentos extends Error {
  constructor(readonly segundos: number) {
    super('Demasiados intentos');
    this.name = 'ErrorDemasiadosIntentos';
  }
}
