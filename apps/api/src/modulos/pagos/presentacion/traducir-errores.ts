import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import {
  ErrorEsquelaNoEncontrada,
  ErrorExpedienteNoPendiente,
  ErrorReciboRepetido,
} from '../aplicacion/errores';
import { ErrorDatoPagos, ErrorEsquelaNoPagada, ErrorEsquelaYaPagada } from '../dominio/errores';

/** Convierte los errores de Pagos en problemas del contrato (sin datos personales). */
export const traducirErrorPagos = (error: unknown): unknown => {
  if (error instanceof ErrorDatoPagos) {
    return new ErrorValidacion([{ campo: error.campo, mensaje: error.message }]);
  }
  if (error instanceof ErrorEsquelaNoEncontrada) {
    return ErrorProblema.noEncontrado();
  }
  if (error instanceof ErrorEsquelaYaPagada) {
    return ErrorProblema.esquelaYaPagada();
  }
  if (error instanceof ErrorReciboRepetido) {
    return ErrorProblema.reciboRepetido();
  }
  if (error instanceof ErrorExpedienteNoPendiente) {
    return ErrorProblema.transicionInvalida(error.estado);
  }
  if (error instanceof ErrorEsquelaNoPagada) {
    return ErrorProblema.transicionInvalida('PENDIENTE_PAGO');
  }
  return error;
};
