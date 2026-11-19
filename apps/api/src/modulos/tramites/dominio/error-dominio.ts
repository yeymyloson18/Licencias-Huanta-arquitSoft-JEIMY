/** Una regla del trámite no se cumple. El mensaje nunca incluye datos personales (FR-035). */
export class ErrorDominio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}
