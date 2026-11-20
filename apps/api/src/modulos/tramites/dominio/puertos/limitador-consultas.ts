// Límite de la consulta pública (aclaración 1 de la 004, research §R-07): 5 fallos por origen en 15
// minutos. Se reserva un intento antes de buscar y se libera si la consulta acertó, así una consulta
// correcta no suma y dos fallos simultáneos no pasan el límite. Si los contadores no responden, lanza
// `ErrorLimitadorConsultasNoDisponible` (falla cerrado).

export interface ReservaConsulta {
  /** `false` si este intento supera el límite: no se busca nada. */
  readonly permitido: boolean;
  /** Segundos hasta que se pueda reintentar (0 si está permitido). */
  readonly segundosRestantes: number;
}

export class ErrorLimitadorConsultasNoDisponible extends Error {
  constructor() {
    super('El límite de consultas no está disponible');
    this.name = 'ErrorLimitadorConsultasNoDisponible';
  }
}

export interface LimitadorConsultas {
  reservar(origen: string): Promise<ReservaConsulta>;
  liberar(origen: string): Promise<void>;
}
