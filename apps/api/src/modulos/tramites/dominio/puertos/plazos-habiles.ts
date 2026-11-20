/** Puerto: cálculo de días hábiles (adaptador de la fachada de Plazos, 006). Fechas `AAAA-MM-DD`. */
export interface PlazosHabiles {
  /** Suma días hábiles empezando a contar el día siguiente a `desde`. */
  sumarDiasHabiles(desde: string, dias: number): Promise<string>;
  /** Días hábiles que faltan hasta `vence` (0 si vence hoy; negativo si ya venció). */
  diasHabilesRestantes(hoy: string, vence: string): Promise<number>;
}
