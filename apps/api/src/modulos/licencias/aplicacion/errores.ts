/** La licencia no existe (404). */
export class ErrorLicenciaNoEncontrada extends Error {
  constructor() {
    super('La licencia no existe');
    this.name = 'ErrorLicenciaNoEncontrada';
  }
}

/** El `tokenConsulta` es de otro expediente (403). */
export class ErrorLicenciaDeOtroExpediente extends Error {
  constructor() {
    super('La licencia es de otro expediente');
    this.name = 'ErrorLicenciaDeOtroExpediente';
  }
}

/** Trámites no devolvió los datos del expediente: el evento se reintenta. */
export class ErrorExpedienteSinDatos extends Error {
  constructor() {
    super('El expediente no tiene los datos para la licencia');
    this.name = 'ErrorExpedienteSinDatos';
  }
}
