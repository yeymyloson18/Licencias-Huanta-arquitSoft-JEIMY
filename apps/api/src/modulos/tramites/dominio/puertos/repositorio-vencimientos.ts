import type { EstadoExpediente } from '../estado-publico';

/** Expediente en trámite sin vencimiento calculado (presentado antes de la 006). */
export interface ExpedienteSinVencimiento {
  readonly id: string;
  readonly estado: EstadoExpediente;
  readonly presentadoEn: Date;
  /** Plazo en días hábiles de la receta guardada al presentar. */
  readonly plazoDias: number;
}

/** Expediente con plazo corriendo, para el reloj de plazos (006). */
export interface ExpedienteConPlazo {
  readonly numero: string;
  readonly estado: EstadoExpediente;
  readonly vencePlazoEn: string;
}

/** Puerto: lectura y escritura del plazo de los expedientes (006). */
export interface RepositorioVencimientos {
  sinVencimiento(estados: readonly EstadoExpediente[]): Promise<ExpedienteSinVencimiento[]>;
  /** Solo si sigue sin vencimiento ni plazo suspendido (no pisa un cálculo concurrente). */
  fijar(
    id: string,
    plazo: { readonly vencePlazoEn: string | null; readonly plazoRestanteDias: number | null },
  ): Promise<void>;
  conPlazo(estados: readonly EstadoExpediente[]): Promise<ExpedienteConPlazo[]>;
  estadosDe(numeros: readonly string[]): Promise<ReadonlyMap<string, EstadoExpediente>>;
}
