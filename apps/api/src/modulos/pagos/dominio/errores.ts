// Errores del dominio de Pagos. Ninguno lleva datos personales (principio VII).

export class ErrorDominioPagos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominioPagos';
  }
}

/** Un dato no cumple las reglas: el campo y un mensaje claro (422). */
export class ErrorDatoPagos extends ErrorDominioPagos {
  constructor(
    readonly campo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDatoPagos';
  }
}

/** La esquela ya tiene un pago registrado (409 `esquela-ya-pagada`). */
export class ErrorEsquelaYaPagada extends ErrorDominioPagos {
  constructor() {
    super('La esquela ya fue pagada');
    this.name = 'ErrorEsquelaYaPagada';
  }
}

/** La operación exige una esquela pagada (por ejemplo, corregir el recibo; 409). */
export class ErrorEsquelaNoPagada extends ErrorDominioPagos {
  constructor() {
    super('La esquela todavía no está pagada');
    this.name = 'ErrorEsquelaNoPagada';
  }
}
