// Errores de aplicación de Pagos. Ninguno lleva datos personales.

/** No hay una esquela con ese código (404). */
export class ErrorEsquelaNoEncontrada extends Error {
  constructor() {
    super('Esquela no encontrada');
    this.name = 'ErrorEsquelaNoEncontrada';
  }
}

/** El número de recibo ya está en otra esquela (409 `recibo-repetido`). */
export class ErrorReciboRepetido extends Error {
  constructor() {
    super('Recibo repetido');
    this.name = 'ErrorReciboRepetido';
  }
}

/** El expediente no está esperando el pago (por ejemplo, DENEGADO; 409 `transicion-invalida`). */
export class ErrorExpedienteNoPendiente extends Error {
  constructor(readonly estado: string) {
    super(`El expediente está ${estado}`);
    this.name = 'ErrorExpedienteNoPendiente';
  }
}
