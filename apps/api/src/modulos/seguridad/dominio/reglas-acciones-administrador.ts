import { ErrorDominio } from './error-dominio';

/** Acciones de la ficha que el administrador no puede hacer sobre su propia cuenta (FR-018, 009). */
export type AccionSobreUsuario = 'CERRAR_SESIONES' | 'DESBLOQUEAR';

/** Intento de cerrar sus propias sesiones o de desbloquearse a sí mismo (409). */
export class ErrorAccionSobreSiMismo extends ErrorDominio {
  constructor(readonly accion: AccionSobreUsuario) {
    super('Esta acción no se puede hacer sobre la propia cuenta');
    this.name = 'ErrorAccionSobreSiMismo';
  }
}

/**
 * Reglas de la ficha del usuario (research §R-09 de la 009): para cerrarse la sesión basta "Cerrar
 * sesión", y un administrador bloqueado no podría estar usando la ficha. La regla de "nunca sin
 * administrador activo" sigue en `ReglaUltimoAdministrador`.
 */
export const ReglasAccionesAdministrador = {
  verificar(accion: AccionSobreUsuario, administradorId: string, usuarioId: string): void {
    if (administradorId === usuarioId) {
      throw new ErrorAccionSobreSiMismo(accion);
    }
  },
} as const;
