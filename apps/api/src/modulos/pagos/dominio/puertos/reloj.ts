/** Puerto: la hora actual (para probar sin depender del reloj del sistema). */
export interface Reloj {
  ahora(): Date;
}
