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

  // --- Funcionalidad 004 (contracts/identidad-y-solicitud.md y consulta-y-bandeja.md).

  static identificacionNoDisponible(): ErrorProblema {
    return new ErrorProblema(
      'identificacion-no-disponible',
      503,
      'No pudimos verificar tu identidad en este momento. Puedes acudir a mesa de partes',
    );
  }

  static intentosNoDisponibles(): ErrorProblema {
    return new ErrorProblema(
      'servicio-no-disponible',
      503,
      'El servicio no está disponible en este momento. Vuelve a intentarlo en unos minutos',
    );
  }

  static identidadNoConfirmada(): ErrorProblema {
    return new ErrorProblema(
      'identidad-no-confirmada',
      403,
      'La identidad enviada no es la que se confirmó con el código',
    );
  }

  static permisoUsado(): ErrorProblema {
    return new ErrorProblema(
      'permiso-usado',
      409,
      'Este permiso ya se usó para presentar una solicitud. Confirma tu identidad de nuevo',
    );
  }

  static archivoDemasiadoGrande(): ErrorProblema {
    return new ErrorProblema('archivo-demasiado-grande', 413, 'El archivo supera los 10 MB');
  }

  static tipoArchivoNoPermitido(): ErrorProblema {
    return new ErrorProblema(
      'tipo-archivo-no-permitido',
      415,
      'Solo se aceptan archivos PDF, JPG o PNG',
    );
  }

  // --- Funcionalidad 005: evaluación, esquela y pago.

  /** La acción no corresponde al estado del expediente; el título nombra el estado (FR-010). */
  static transicionInvalida(estadoActual: string): ErrorProblema {
    return new ErrorProblema(
      'transicion-invalida',
      409,
      `Esta acción no corresponde a un expediente en estado ${estadoActual}`,
    );
  }

  static yaObservado(): ErrorProblema {
    return new ErrorProblema(
      'ya-observado',
      409,
      'Este expediente ya fue observado una vez; el TUPA permite una sola observación',
    );
  }

  static esquelaYaPagada(): ErrorProblema {
    return new ErrorProblema('esquela-ya-pagada', 409, 'Esta esquela ya fue pagada');
  }

  static reciboRepetido(): ErrorProblema {
    return new ErrorProblema(
      'recibo-repetido',
      409,
      'Ese número de recibo ya está registrado en otra esquela',
    );
  }

  static versionCambiada(): ErrorProblema {
    return new ErrorProblema(
      'version-cambiada',
      412,
      'El expediente cambió mientras lo revisabas. Vuelve a cargarlo',
    );
  }
}
