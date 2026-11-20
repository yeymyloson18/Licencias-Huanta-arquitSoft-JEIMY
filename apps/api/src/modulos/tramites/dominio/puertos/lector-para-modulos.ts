import type { Ruta } from '../maquina-estados';

/** Datos públicos del expediente para la licencia (006). Nunca el documento ni la dirección. */
export interface DatosParaLicencia {
  readonly numeroExpediente: string;
  readonly codigoReceta: string;
  readonly ruta: Ruta;
  readonly nombreComercial: string | null;
  readonly giro: string;
  readonly zona: string;
  readonly razonSocial: string | null;
  readonly nombreTitular: string;
  readonly vigenciaMeses: number | null;
}

/**
 * Puerto: lecturas del expediente que piden otros módulos por la fachada de Trámites (006). Cada
 * método devuelve solo lo que ese módulo necesita.
 */
export interface LectorParaModulos {
  datosParaLicencia(numero: string): Promise<DatosParaLicencia | null>;
  /** Giro y licencia para la bandeja de inspecciones (sin datos personales). */
  resumenesParaInspeccion(
    numeros: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly giro: string; readonly nombreLicencia: string }>>;
  /** Dirección del local descifrada: solo para el inspector asignado (research §R-14 de la 006). */
  direccionDelLocal(numero: string): Promise<string | null>;
}
