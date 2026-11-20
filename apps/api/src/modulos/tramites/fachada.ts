// Fachada pública del módulo Trámites: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

import type { EstadoExpediente } from './dominio/estado-publico';
import type { LectorParaCaja } from './dominio/puertos/lector-para-caja';
import type { DatosParaLicencia, LectorParaModulos } from './dominio/puertos/lector-para-modulos';

export type { EstadoExpediente } from './dominio/estado-publico';
export type { DatosParaLicencia } from './dominio/puertos/lector-para-modulos';

/** Operaciones de Trámites que usan otros módulos (Pagos, Licencias…). Sin datos personales. */
export class FachadaTramites {
  constructor(
    private readonly lector: LectorParaCaja,
    private readonly lectorModulos?: LectorParaModulos,
  ) {}

  /** Estado del expediente para decidir si se puede pagar su esquela (FR-024 de la 005). */
  async estadoParaPago(numeroExpediente: string): Promise<EstadoExpediente | null> {
    return (await this.lector.obtener(numeroExpediente))?.estado ?? null;
  }

  /** Datos públicos para emitir la licencia (FR-014 y FR-015 de la 006); sin documento ni dirección. */
  datosParaLicencia(numeroExpediente: string): Promise<DatosParaLicencia | null> {
    return this.modulos().datosParaLicencia(numeroExpediente);
  }

  /** Giro y nombre de la licencia de cada expediente, para la bandeja de inspecciones (006). */
  resumenesParaInspeccion(
    numeros: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly giro: string; readonly nombreLicencia: string }>> {
    return this.modulos().resumenesParaInspeccion(numeros);
  }

  /**
   * Dirección del local, descifrada. Solo para mostrarla al inspector asignado (research §R-14 de la
   * 006): quien la pide no la guarda ni la registra.
   */
  direccionDelLocal(numeroExpediente: string): Promise<string | null> {
    return this.modulos().direccionDelLocal(numeroExpediente);
  }

  private modulos(): LectorParaModulos {
    if (this.lectorModulos === undefined) {
      throw new Error('La fachada de Trámites no tiene el lector para módulos');
    }
    return this.lectorModulos;
  }
}
