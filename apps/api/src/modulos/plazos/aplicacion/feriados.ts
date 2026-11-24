import { esFechaValida, type Fecha, sumarDias } from '../../../compartido/dominio/fecha-lima';
import { CalendarioHabil } from '../../../compartido/dominio/calendario-habil';
import { crearFeriado, ErrorDatoFeriado, type Feriado } from '../dominio/feriado';
import type { RepositorioFeriados } from '../dominio/puertos';

/** Ya hay un feriado en esa fecha (409). */
export class ErrorFeriadoRepetido extends Error {
  constructor() {
    super('Ya hay un feriado en esa fecha');
    this.name = 'ErrorFeriadoRepetido';
  }
}

/** No hay un feriado en esa fecha (404). */
export class ErrorFeriadoNoEncontrado extends Error {
  constructor() {
    super('No hay un feriado en esa fecha');
    this.name = 'ErrorFeriadoNoEncontrado';
  }
}

/** Gestión de feriados por el administrador (HU16, FR-023 de la 006). */
export class GestionarFeriados {
  constructor(private readonly feriados: RepositorioFeriados) {}

  listar(anio: number): Promise<Feriado[]> {
    return this.feriados.listar(anio);
  }

  async registrar(
    entrada: { readonly fecha: string; readonly descripcion: string; readonly alcance: string },
    usuarioId: string,
  ): Promise<Feriado> {
    const feriado = crearFeriado(entrada);
    if ((await this.feriados.registrar(feriado, usuarioId)) === 'REPETIDO') {
      throw new ErrorFeriadoRepetido();
    }
    return feriado;
  }

  async eliminar(fecha: string, usuarioId: string): Promise<void> {
    if (!esFechaValida(fecha)) {
      throw new ErrorDatoFeriado('fecha', 'Debe ser una fecha AAAA-MM-DD');
    }
    if (!(await this.feriados.eliminar(fecha, usuarioId))) {
      throw new ErrorFeriadoNoEncontrado();
    }
  }
}

/** Margen de feriados que se cargan para un cálculo: los plazos del TUPA caben de sobra en un año. */
const MARGEN_DIAS = 400;

/**
 * Cálculo de plazos en días hábiles con los feriados registrados (FR-025 a FR-027). Lee los feriados
 * del rango necesario en cada cálculo: así un feriado nuevo cuenta desde el siguiente cálculo.
 */
export class CalcularPlazos {
  constructor(private readonly feriados: Pick<RepositorioFeriados, 'fechasEntre'>) {}

  async sumarDiasHabiles(desde: Fecha, dias: number): Promise<Fecha> {
    const calendario = await this.calendario(desde, sumarDias(desde, MARGEN_DIAS));
    return calendario.sumarDiasHabiles(desde, dias);
  }

  async diasHabilesRestantes(hoy: Fecha, vence: Fecha): Promise<number> {
    const [inicio, fin] = hoy < vence ? [hoy, vence] : [vence, hoy];
    const calendario = await this.calendario(inicio, fin);
    return calendario.diasHabilesRestantes(hoy, vence);
  }

  feriadosEntre(desde: Fecha, hasta: Fecha): Promise<ReadonlySet<Fecha>> {
    return this.feriados.fechasEntre(desde, hasta);
  }

  private async calendario(desde: Fecha, hasta: Fecha): Promise<CalendarioHabil> {
    return new CalendarioHabil(await this.feriados.fechasEntre(desde, hasta));
  }
}
