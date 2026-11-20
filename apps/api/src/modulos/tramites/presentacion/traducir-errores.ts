import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import {
  ErrorArchivoDemasiadoGrande,
  ErrorIdentidadNoConfirmada,
  ErrorIdentificacionNoDisponible,
  ErrorPermisoUsado,
  ErrorTipoArchivoNoPermitido,
} from '../aplicacion/errores';
import { ErrorValidacionSolicitud } from '../dominio/errores';

/** Convierte los errores de Trámites en problemas del contrato (sin datos personales). */
export const traducirErrorTramites = (error: unknown): unknown => {
  if (error instanceof ErrorValidacionSolicitud) {
    return new ErrorValidacion(error.errores);
  }
  if (error instanceof ErrorIdentidadNoConfirmada) {
    return ErrorProblema.identidadNoConfirmada();
  }
  if (error instanceof ErrorIdentificacionNoDisponible) {
    return ErrorProblema.identificacionNoDisponible();
  }
  if (error instanceof ErrorPermisoUsado) {
    return ErrorProblema.permisoUsado();
  }
  if (error instanceof ErrorArchivoDemasiadoGrande) {
    return ErrorProblema.archivoDemasiadoGrande();
  }
  if (error instanceof ErrorTipoArchivoNoPermitido) {
    return ErrorProblema.tipoArchivoNoPermitido();
  }
  return error;
};
