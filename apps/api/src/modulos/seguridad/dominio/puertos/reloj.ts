/** Hora actual; las pruebas la reemplazan para comprobar vencimientos. */
export interface Reloj {
  ahora(): Date;
}
