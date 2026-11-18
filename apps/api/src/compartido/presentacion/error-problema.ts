// Errores HTTP con un tipo de problema propio (contracts/openapi-cambios.md §4 de la 002).
// FiltroProblema los responde con su `type`, `title` y `status`, y agrega `Retry-After` cuando
// corresponde. Los títulos nunca incluyen datos personales ni dicen qué dato falló (FR-005, FR-029).

const BASE_TIPOS = 'https://licencias.example.pe/errores/';

export class ErrorProblema extends Error {
  private constructor(
    readonly tipo: string,
    readonly status: number,
    readonly titulo: string,
    readonly reintentarEnSegundos?: number,
  ) {
    super(titulo);
    this.name = 'ErrorProblema';
  }

  /** URI completa del tipo de problema. */
  get type(): string {
    return `${BASE_TIPOS}${this.tipo}`;
  }

  static noAutenticado(): ErrorProblema {
    return new ErrorProblema(
      'no-autenticado',
      401,
      'Correo, clave o código incorrectos, o la sesión terminó',
    );
  }

  static sinPermiso(): ErrorProblema {
    return new ErrorProblema('sin-permiso', 403, 'No tiene permiso para esta operación');
  }

  static debeCambiarClave(): ErrorProblema {
    return new ErrorProblema('debe-cambiar-clave', 403, 'Debe cambiar su clave antes de continuar');
  }

  static demasiadosIntentos(segundos: number): ErrorProblema {
    return new ErrorProblema(
      'demasiados-intentos',
      429,
      'Demasiados intentos. Vuelva a intentarlo más tarde',
      Math.max(1, Math.ceil(segundos)),
    );
  }

  static ultimoAdministrador(): ErrorProblema {
    return new ErrorProblema(
      'ultimo-administrador',
      409,
      'Debe existir al menos un administrador activo',
    );
  }

  static correoEnUso(): ErrorProblema {
    return new ErrorProblema('correo-en-uso', 409, 'El correo ya está en uso');
  }

  static noEncontrado(): ErrorProblema {
    return new ErrorProblema('no-encontrado', 404, 'Recurso no encontrado');
  }

  static servicioNoDisponible(): ErrorProblema {
    return new ErrorProblema(
      'servicio-no-disponible',
      503,
      'El inicio de sesión no está disponible en este momento',
    );
  }
}
