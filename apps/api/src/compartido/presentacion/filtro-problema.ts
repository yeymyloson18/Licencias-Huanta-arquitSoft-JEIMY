import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ErrorProblema } from './error-problema';

// Convierte cualquier error en `application/problem+json` (RFC 9457, esquema `Problema` del
// contrato). Nunca devuelve trazas, mensajes internos ni datos personales (FR-011, principio VII).

export interface ErrorCampo {
  readonly campo: string;
  readonly mensaje: string;
}

export interface Problema {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly errores?: readonly ErrorCampo[];
}

/** Error de validación de entrada: se responde con 422 y la lista de campos inválidos. */
export class ErrorValidacion extends Error {
  constructor(readonly errores: readonly ErrorCampo[]) {
    super('Los datos no cumplen las reglas de validación');
    this.name = 'ErrorValidacion';
  }
}

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
  status(codigo: number): RespuestaHttp;
  type(tipo: string): RespuestaHttp;
  send(cuerpo: string): unknown;
}

const TITULOS: Readonly<Record<number, string>> = {
  400: 'Solicitud incorrecta',
  401: 'No autenticado',
  403: 'Sin permiso',
  404: 'Recurso no encontrado',
  405: 'Método no permitido',
  409: 'Conflicto con el estado actual',
  422: 'Los datos no cumplen las reglas de validación',
  429: 'Demasiados intentos',
  503: 'Servicio no disponible',
};

const TIPO_GENERICO = 'about:blank';
const TIPO_VALIDACION = 'https://licencias.example.pe/errores/validacion';

export const aProblema = (excepcion: unknown): Problema => {
  if (excepcion instanceof ErrorProblema) {
    return { type: excepcion.type, title: excepcion.titulo, status: excepcion.status };
  }

  if (excepcion instanceof ErrorValidacion) {
    return {
      type: TIPO_VALIDACION,
      title: TITULOS[422] ?? '',
      status: 422,
      errores: excepcion.errores,
    };
  }

  if (excepcion instanceof HttpException) {
    const status = excepcion.getStatus();
    if (status < 500) {
      return { type: TIPO_GENERICO, title: TITULOS[status] ?? 'Solicitud no procesada', status };
    }
  }

  return { type: TIPO_GENERICO, title: 'Error interno del servidor', status: 500 };
};

@Catch()
export class FiltroProblema implements ExceptionFilter {
  private readonly registro = new Logger(FiltroProblema.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const problema = aProblema(excepcion);
    const respuesta = host.switchToHttp().getResponse<RespuestaHttp>();

    if (problema.status >= 500 && !(excepcion instanceof ErrorProblema)) {
      // Solo el tipo de error: el mensaje podría contener datos de conexión.
      const nombre = excepcion instanceof Error ? excepcion.name : typeof excepcion;
      this.registro.error(`Error no controlado (${nombre})`);
    }

    if (excepcion instanceof ErrorProblema && excepcion.reintentarEnSegundos !== undefined) {
      respuesta.setHeader('Retry-After', String(excepcion.reintentarEnSegundos));
    }

    respuesta
      .status(problema.status)
      .type('application/problem+json')
      .send(JSON.stringify(problema));
  }
}
