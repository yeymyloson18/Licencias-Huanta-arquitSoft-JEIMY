import { ErrorDominio } from './error-dominio';

/** Plazo del trámite en días hábiles: entero > 0 cuando existe. */
export class PlazoDiasHabiles {
  private constructor(readonly dias: number) {}

  static crear(dias: number): PlazoDiasHabiles {
    if (!Number.isInteger(dias) || dias <= 0) {
      throw new ErrorDominio('El plazo debe ser un número entero de días hábiles mayor que 0');
    }
    return new PlazoDiasHabiles(dias);
  }
}
