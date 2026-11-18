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
