// Fachada pública del módulo Trámites: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

import {
  type CompletarVencimientos,
  ESTADOS_PLAZO_CORRIENDO,
} from './aplicacion/completar-vencimientos';
import {
  type EstadoExpediente,
  esEstadoExpediente,
  TEXTO_ESTADO_PUBLICO,
} from './dominio/estado-publico';
import type { RepositorioVencimientos } from './dominio/puertos/repositorio-vencimientos';
import type { LectorParaCaja } from './dominio/puertos/lector-para-caja';
import type { DatosParaLicencia, LectorParaModulos } from './dominio/puertos/lector-para-modulos';

export type { EstadoExpediente } from './dominio/estado-publico';
export type { DatosParaLicencia } from './dominio/puertos/lector-para-modulos';

/** Operaciones de Trámites que usan otros módulos (Pagos, Licencias…). Sin datos personales. */
export class FachadaTramites {
  constructor(
    private readonly lector: LectorParaCaja,
    private readonly lectorModulos?: LectorParaModulos,
    private readonly plazos?: {
      readonly completar: CompletarVencimientos;
      readonly vencimientos: Pick<RepositorioVencimientos, 'conPlazo' | 'estadosDe'>;
    },
  ) {}

  /**
   * Completa el vencimiento de los expedientes presentados antes de la 006 (FR-026). Idempotente; lo
   * llama el reloj de plazos. Devuelve cuántos completó.
   */
  completarVencimientos(): Promise<number> {
    return this.plazosDeTramites().completar.ejecutar();
  }

  /** Expedientes cuyo plazo corre (la Municipalidad debe actuar), para el reloj de plazos (FR-028). */
  expedientesConPlazo(): Promise<
    readonly {
      readonly numero: string;
      readonly estado: EstadoExpediente;
      readonly vencePlazoEn: string;
    }[]
  > {
    return this.plazosDeTramites().vencimientos.conPlazo(ESTADOS_PLAZO_CORRIENDO);
  }

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

  /** Estado de cada expediente (alertas de la jefatura, 006). */
  estadosDe(numeros: readonly string[]): Promise<ReadonlyMap<string, EstadoExpediente>> {
    return this.plazosDeTramites().vencimientos.estadosDe(numeros);
  }

  /**
   * Contacto del titular para el aviso (006): correo si lo dio y celular, descifrados. Quien lo pide
   * lo vuelve a cifrar y nunca lo registra.
   */
  contactoTitular(
    numeroExpediente: string,
  ): Promise<{ readonly correo: string | null; readonly celular: string } | null> {
    return this.modulos().contactoTitular(numeroExpediente);
  }

  /** El estado en lenguaje sencillo y qué sigue (los textos de la consulta pública). */
  textoDeEstado(
    estado: string,
  ): { readonly descripcion: string; readonly siguientePaso: string } | null {
    return esEstadoExpediente(estado) ? TEXTO_ESTADO_PUBLICO[estado] : null;
  }

  private plazosDeTramites() {
    if (this.plazos === undefined) {
      throw new Error('La fachada de Trámites no tiene los plazos');
    }
    return this.plazos;
  }

  private modulos(): LectorParaModulos {
    if (this.lectorModulos === undefined) {
      throw new Error('La fachada de Trámites no tiene el lector para módulos');
    }
    return this.lectorModulos;
  }
}
