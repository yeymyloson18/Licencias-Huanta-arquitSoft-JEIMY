import type { Fecha } from '../../../compartido/dominio/fecha-lima';
import type { Feriado } from './feriado';

/** Puerto: la hora actual. */
export interface Reloj {
  ahora(): Date;
}

/** Puerto: `plazos.feriado`. */
export interface RepositorioFeriados {
  listar(anio: number): Promise<Feriado[]>;
  /** Las fechas de los feriados entre dos fechas (ambas incluidas). */
  fechasEntre(desde: Fecha, hasta: Fecha): Promise<ReadonlySet<Fecha>>;
  registrar(feriado: Feriado, usuarioId: string): Promise<'REGISTRADO' | 'REPETIDO'>;
  eliminar(fecha: Fecha): Promise<boolean>;
}
