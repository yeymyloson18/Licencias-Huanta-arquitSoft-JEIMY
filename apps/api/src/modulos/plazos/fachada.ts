// Fachada pública del módulo Plazos: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

import type { CalcularPlazos } from './aplicacion/feriados';

/** Cálculo de plazos en días hábiles para otros módulos (Trámites, 006). Fechas `AAAA-MM-DD`. */
export class FachadaPlazos {
  constructor(private readonly plazos: CalcularPlazos) {}

  /** Suma días hábiles empezando a contar el día siguiente a `desde`. */
  sumarDiasHabiles(desde: string, dias: number): Promise<string> {
    return this.plazos.sumarDiasHabiles(desde, dias);
  }

  /** Días hábiles que faltan hasta `vence` (0 si vence hoy; negativo si ya venció). */
  diasHabilesRestantes(hoy: string, vence: string): Promise<number> {
    return this.plazos.diasHabilesRestantes(hoy, vence);
  }
}
