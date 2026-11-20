// Errores de aplicación de Trámites. Ninguno lleva datos personales (FR-035).

/** El archivo supera los 10 MB (413). */
export class ErrorArchivoDemasiadoGrande extends Error {
  constructor() {
    super('El archivo supera los 10 MB');
    this.name = 'ErrorArchivoDemasiadoGrande';
  }
}

/** El contenido no es PDF, JPG ni PNG (415). */
export class ErrorTipoArchivoNoPermitido extends Error {
  constructor() {
    super('Tipo de archivo no permitido');
    this.name = 'ErrorTipoArchivoNoPermitido';
  }
}

/** La identidad enviada no es la confirmada con el código (403). */
export class ErrorIdentidadNoConfirmada extends Error {
  constructor() {
    super('La identidad no es la confirmada');
    this.name = 'ErrorIdentidadNoConfirmada';
  }
}

/** El permiso de identidad ya se usó en otra solicitud (409, aclaración 2). */
export class ErrorPermisoUsado extends Error {
  constructor() {
    super('El permiso de identidad ya se usó');
    this.name = 'ErrorPermisoUsado';
  }
}

/** El servicio de identificación no responde en mesa de partes (503). */
export class ErrorIdentificacionNoDisponible extends Error {
  constructor() {
    super('El servicio de identificación no está disponible');
    this.name = 'ErrorIdentificacionNoDisponible';
  }
}

/** El expediente o el documento no existe, o el documento es de otro expediente (404). */
export class ErrorExpedienteNoEncontrado extends Error {
  constructor() {
    super('Expediente o documento no encontrado');
    this.name = 'ErrorExpedienteNoEncontrado';
  }
}

/** Otro usuario cambió el expediente desde que se leyó (`If-Match`, 412). */
export class ErrorVersionCambiada extends Error {
  constructor() {
    super('El expediente cambió');
    this.name = 'ErrorVersionCambiada';
  }
}

/** El expediente ya tiene una observación; el TUPA permite una sola (409). */
export class ErrorYaObservado extends Error {
  constructor() {
    super('El expediente ya fue observado');
    this.name = 'ErrorYaObservado';
  }
}
