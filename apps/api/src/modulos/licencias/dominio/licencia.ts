import { type Fecha, fechaLima, sumarMeses } from '../../../compartido/dominio/fecha-lima';
import { titularPublico } from '../../../compartido/dominio/titular-publico';

export type TipoLicencia = 'DEFINITIVA' | 'PROVISIONAL';
export type EstadoLicencia = 'VIGENTE' | 'VENCIDA';
export type EstadoItse = 'SIN_CERTIFICADO' | 'VIGENTE' | 'VENCIDO';

/** Certificado ITSE: se renueva cada 2 años (FR-011 de la 006). */
export interface CertificadoItse {
  readonly numero: string;
  readonly emitidoEn: Fecha;
  readonly venceEn: Fecha;
}

export const crearCertificado = (numero: string, emitidoEn: Fecha): CertificadoItse => ({
  numero,
  emitidoEn,
  venceEn: sumarMeses(emitidoEn, 24),
});

/** Datos del expediente que necesita la licencia (los da Trámites por su fachada; sin documento). */
export interface DatosExpedienteParaLicencia {
  readonly numeroExpediente: string;
  readonly codigoReceta: string;
  readonly nombreComercial: string | null;
  readonly giro: string;
  readonly zona: string;
  readonly razonSocial: string | null;
  readonly nombreTitular: string;
  /** Vigencia de la receta guardada al presentar (12 en la provisional de bodega). */
  readonly vigenciaMeses: number | null;
}

export interface DatosLicencia {
  readonly numero: string;
  readonly numeroExpediente: string;
  readonly codigoReceta: string;
  readonly tipo: TipoLicencia;
  readonly nombreComercial: string | null;
  readonly giro: string;
  readonly zona: string;
  readonly titularPublico: string;
  readonly codigoVerificacion: string;
  readonly emitidaEn: Date;
  /** `null` = vigencia indeterminada (la definitiva). */
  readonly vigenteHasta: Fecha | null;
  readonly certificado: CertificadoItse | null;
}

/** Número `LF-AAAA-NNNNNN` con el año de emisión en Lima (FR-014). */
export const numeroLicencia = (emitidaEn: Date, correlativo: number): string =>
  `LF-${fechaLima(emitidaEn).slice(0, 4)}-${String(correlativo).padStart(6, '0')}`;

/** Licencia de funcionamiento con su código QR (HU06, RF13). */
export class Licencia {
  private constructor(private readonly datos: DatosLicencia) {}

  static emitir(entrada: {
    readonly correlativo: number;
    readonly codigoVerificacion: string;
    readonly tipo: TipoLicencia;
    readonly expediente: DatosExpedienteParaLicencia;
    readonly certificado: { readonly numero: string; readonly emitidoEn: Fecha } | null;
    readonly en: Date;
  }): Licencia {
    const { expediente, tipo, en } = entrada;
    const meses = expediente.vigenciaMeses ?? 12;
    return new Licencia({
      numero: numeroLicencia(en, entrada.correlativo),
      numeroExpediente: expediente.numeroExpediente,
      codigoReceta: expediente.codigoReceta,
      tipo,
      nombreComercial: expediente.nombreComercial,
      giro: expediente.giro,
      zona: expediente.zona,
      titularPublico: titularPublico(expediente),
      codigoVerificacion: entrada.codigoVerificacion,
      emitidaEn: en,
      vigenteHasta: tipo === 'PROVISIONAL' ? sumarMeses(fechaLima(en), meses) : null,
      certificado:
        entrada.certificado === null
          ? null
          : crearCertificado(entrada.certificado.numero, entrada.certificado.emitidoEn),
    });
  }

  static reconstruir(datos: DatosLicencia): Licencia {
    return new Licencia(datos);
  }

  get numero(): string {
    return this.datos.numero;
  }

  get numeroExpediente(): string {
    return this.datos.numeroExpediente;
  }

  aDatos(): DatosLicencia {
    return this.datos;
  }

  /** VENCIDA cuando la vigencia ya pasó (se calcula al leer, data-model §3). */
  estadoEn(hoy: Fecha): EstadoLicencia {
    return this.datos.vigenteHasta !== null && this.datos.vigenteHasta < hoy
      ? 'VENCIDA'
      : 'VIGENTE';
  }

  itseEstadoEn(hoy: Fecha): EstadoItse {
    const certificado = this.datos.certificado;
    if (certificado === null) {
      return 'SIN_CERTIFICADO';
    }
    return certificado.venceEn < hoy ? 'VENCIDO' : 'VIGENTE';
  }
}
