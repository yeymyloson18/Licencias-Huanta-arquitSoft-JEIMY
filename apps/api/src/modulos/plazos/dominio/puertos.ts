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

/** Una alerta guardada (`plazos.alerta`). */
export interface AlertaGuardada {
  readonly id: number;
  readonly numeroExpediente: string;
  readonly venceEn: Fecha;
  readonly diasHabilesRestantes: number;
  readonly generadaEn: Date;
  readonly atendidaEn: Date | null;
  readonly atendidaPor: string | null;
}

/** Puerto: `plazos.alerta` (UNIQUE por expediente y vencimiento: ni cero ni duplicadas, EQ-07). */
export interface RepositorioAlertas {
  /** `true` si la insertó; `false` si ya existía para ese expediente y vencimiento. */
  insertarSiNoExiste(
    numeroExpediente: string,
    venceEn: Fecha,
    dias: number,
    en: Date,
  ): Promise<boolean>;
  listar(soloPendientes: boolean): Promise<AlertaGuardada[]>;
  atender(
    id: number,
    usuarioId: string,
    en: Date,
  ): Promise<'ATENDIDA' | 'YA_ATENDIDA' | 'NO_EXISTE'>;
  obtener(id: number): Promise<AlertaGuardada | null>;
}

/** Puerto: expedientes con plazo (adaptador de la fachada de Trámites). */
export interface ExpedientesConPlazo {
  completarVencimientos(): Promise<number>;
  conPlazo(): Promise<readonly { readonly numero: string; readonly vencePlazoEn: Fecha }[]>;
  estadosDe(numeros: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
