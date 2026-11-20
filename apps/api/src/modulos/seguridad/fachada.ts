// Fachada pública del módulo Seguridad: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").
// Contrato: specs/002-seguridad-usuarios/contracts/control-permisos.md. `PermitirConClaveTemporal`
// es interno del módulo y no se exporta.

import type { ConfirmarIdentidadEnLinea } from './aplicacion/confirmar-identidad-en-linea';
import {
  ErrorDatosInvalidos,
  ErrorIdentidadNoCoincide,
  ErrorIdentidadNoConfirmada,
  ErrorIdentificacionNoDisponible,
} from './aplicacion/errores';
import type { VerificarIdentidadPresencial } from './aplicacion/verificar-identidad-presencial';
import type { EmisorTokensConsulta } from './dominio/puertos/emisor-tokens';
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
export {
  type Solicitante,
  SolicitanteActual,
  SolicitanteGuard,
} from './presentacion/solicitante.guard';
export {
  ConsultaOPersonalGuard,
  LectorActual,
  type LectorConsulta,
} from './presentacion/consulta-o-personal.guard';

/** Resultado de comparar la identidad de una solicitud con la confirmada (004, research §R-05). */
export type ResultadoIdentidadEnLinea =
  | { readonly tipo: 'CONFIRMADA' }
  | { readonly tipo: 'NO_CONFIRMADA' }
  | { readonly tipo: 'DATOS_INVALIDOS'; readonly campos: readonly string[] };

/** Resultado de comprobar en mesa de partes la identidad del titular, sin código (004). */
export type ResultadoIdentidadPresencial =
  | { readonly tipo: 'VALIDA' }
  | { readonly tipo: 'NO_COINCIDE' }
  | { readonly tipo: 'NO_DISPONIBLE' }
  | { readonly tipo: 'DATOS_INVALIDOS'; readonly campos: readonly string[] };

/** Operaciones de Seguridad que usan otros módulos (por ahora, Trámites). */
export class FachadaSeguridad {
  constructor(
    private readonly confirmarIdentidad: ConfirmarIdentidadEnLinea,
    private readonly identidadPresencial: VerificarIdentidadPresencial,
    private readonly emisorConsulta?: EmisorTokensConsulta,
  ) {}

  /**
   * `tokenConsulta` de 15 minutos para leer un solo expediente después de la consulta pública
   * (research §R-08 de la 005). Lo pide Trámites cuando el expediente está PENDIENTE_PAGO.
   */
  async emitirTokenConsulta(
    numeroExpediente: string,
  ): Promise<{ readonly token: string; readonly expiraEn: number }> {
    if (this.emisorConsulta === undefined) {
      throw new Error('La fachada de seguridad no tiene emisor de tokens de consulta');
    }
    return {
      token: await this.emisorConsulta.firmarConsulta(numeroExpediente),
      expiraEn: this.emisorConsulta.segundosDeVidaConsulta,
    };
  }

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

  /** Mesa de partes: ¿el titular (y su representante) coinciden con el servicio de identificación? */
  async verificarIdentidadPresencial(
    identidad: DatosIdentidadAdministrado,
  ): Promise<ResultadoIdentidadPresencial> {
    try {
      await this.identidadPresencial.ejecutar(identidad);
      return { tipo: 'VALIDA' };
    } catch (error) {
      if (error instanceof ErrorDatosInvalidos) {
        return { tipo: 'DATOS_INVALIDOS', campos: error.campos };
      }
      if (error instanceof ErrorIdentidadNoCoincide) {
        return { tipo: 'NO_COINCIDE' };
      }
      if (error instanceof ErrorIdentificacionNoDisponible) {
        return { tipo: 'NO_DISPONIBLE' };
      }
      throw error;
    }
  }
}
