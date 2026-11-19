// Fachada pública del módulo Seguridad: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").
// Contrato: specs/002-seguridad-usuarios/contracts/control-permisos.md. `PermitirConClaveTemporal`
// es interno del módulo y no se exporta.

import type { ConfirmarIdentidadEnLinea } from './aplicacion/confirmar-identidad-en-linea';
import { ErrorDatosInvalidos, ErrorIdentidadNoConfirmada } from './aplicacion/errores';
import type { DatosIdentidadAdministrado } from './dominio/identidad-administrado';

export type { Rol } from './dominio/rol';
export type { DatosIdentidadAdministrado } from './dominio/identidad-administrado';
export { Roles } from './presentacion/decoradores';
export { JwtAuthGuard } from './presentacion/jwt-auth.guard';
export { RolesGuard } from './presentacion/roles.guard';
export {
  RequiereRoles,
  UsuarioActual,
  type UsuarioAutenticado,
} from './presentacion/control-permisos';
export {
  IdentidadActual,
  type IdentidadConfirmada,
  TokenIdentidadGuard,
} from './presentacion/token-identidad.guard';

/** Resultado de comparar la identidad de una solicitud con la confirmada (004, research §R-05). */
export type ResultadoIdentidadEnLinea =
  | { readonly tipo: 'CONFIRMADA' }
  | { readonly tipo: 'NO_CONFIRMADA' }
  | { readonly tipo: 'DATOS_INVALIDOS'; readonly campos: readonly string[] };

/** Operaciones de Seguridad que usan otros módulos (por ahora, Trámites). */
export class FachadaSeguridad {
  constructor(private readonly confirmarIdentidad: ConfirmarIdentidadEnLinea) {}

  /** ¿La identidad que llega con la solicitud es la que se confirmó con el código? */
  async confirmarIdentidadEnLinea(
    verificacionId: string,
    identidad: DatosIdentidadAdministrado,
  ): Promise<ResultadoIdentidadEnLinea> {
    try {
      await this.confirmarIdentidad.ejecutar(verificacionId, identidad);
      return { tipo: 'CONFIRMADA' };
    } catch (error) {
      if (error instanceof ErrorDatosInvalidos) {
        return { tipo: 'DATOS_INVALIDOS', campos: error.campos };
      }
      if (error instanceof ErrorIdentidadNoConfirmada) {
        return { tipo: 'NO_CONFIRMADA' };
      }
      throw error;
    }
  }
}
