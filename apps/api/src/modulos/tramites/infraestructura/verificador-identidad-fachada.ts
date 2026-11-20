import type { FachadaSeguridad } from '../../seguridad/fachada';
import type {
  IdentidadSolicitud,
  ResultadoIdentidad,
  ResultadoIdentidadPresencial,
  VerificadorIdentidad,
} from '../dominio/puertos/verificador-identidad';

/** Adaptador del puerto `VerificadorIdentidad` sobre la fachada del módulo Seguridad (principio I). */
export class VerificadorIdentidadFachada implements VerificadorIdentidad {
  constructor(private readonly seguridad: FachadaSeguridad) {}

  confirmarEnLinea(
    verificacionId: string,
    identidad: IdentidadSolicitud,
  ): Promise<ResultadoIdentidad> {
    return this.seguridad.confirmarIdentidadEnLinea(verificacionId, identidad);
  }

  verificarPresencial(identidad: IdentidadSolicitud): Promise<ResultadoIdentidadPresencial> {
    return this.seguridad.verificarIdentidadPresencial(identidad);
  }
}
