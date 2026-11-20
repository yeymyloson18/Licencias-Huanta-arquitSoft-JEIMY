import { diaDeLaSemana, type Fecha, sumarDias } from '../../../compartido/dominio/fecha-lima';

/**
 * Calendario de días hábiles (FR-025 de la 006, research §R-03): sin sábados, domingos ni feriados
 * registrados. Función pura: los feriados llegan como dato.
 */
export class CalendarioHabil {
  constructor(private readonly feriados: ReadonlySet<Fecha>) {}

  esHabil(fecha: Fecha): boolean {
    const dia = diaDeLaSemana(fecha);
    return dia !== 0 && dia !== 6 && !this.feriados.has(fecha);
  }

  /**
   * Suma `dias` días hábiles empezando a contar el día siguiente a `desde` (un plazo de 2 días
   * presentado el lunes vence el miércoles). Con 0 devuelve `desde`.
   */
  sumarDiasHabiles(desde: Fecha, dias: number): Fecha {
    let fecha = desde;
    let contados = 0;
    while (contados < dias) {
      fecha = sumarDias(fecha, 1);
      if (this.esHabil(fecha)) {
        contados += 1;
      }
    }
    return fecha;
  }

  /**
   * Días hábiles que faltan desde `hoy` hasta `vence` (este incluido): 0 si vence hoy, negativo si ya
   * venció (cuántos días hábiles pasaron desde el vencimiento).
   */
  diasHabilesRestantes(hoy: Fecha, vence: Fecha): number {
    if (vence === hoy) {
      return 0;
    }
    const [desde, hasta, signo] = vence > hoy ? [hoy, vence, 1] : [vence, hoy, -1];
    let fecha = desde;
    let cuenta = 0;
    while (fecha < hasta) {
      fecha = sumarDias(fecha, 1);
      if (this.esHabil(fecha)) {
        cuenta += 1;
      }
    }
    return signo * cuenta;
  }
}
