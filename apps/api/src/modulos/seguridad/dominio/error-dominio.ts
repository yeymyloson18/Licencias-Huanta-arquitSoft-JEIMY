/**
 * Regla del dominio de Seguridad incumplida. El mensaje nunca repite el valor recibido, porque
 * puede ser un dato personal (correo, celular) o una clave (FR-029).
 */
export class ErrorDominio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}
