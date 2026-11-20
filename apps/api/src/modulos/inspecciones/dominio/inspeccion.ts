import type { Fecha } from '../../../compartido/dominio/fecha-lima';

export type TipoInspeccion = 'PREVIA' | 'POSTERIOR' | 'BODEGA';
export type EstadoInspeccion = 'PENDIENTE' | 'ASIGNADA' | 'REALIZADA';
export type ResultadoItse = 'FAVORABLE' | 'DESFAVORABLE';

export const MINIMO_FOTOS = 1;
export const MAXIMO_FOTOS = 5;
export const MAXIMO_OBSERVACIONES = 4000;

/** Un dato del pedido no es válido (422); `campo` nombra el dato, nunca su valor. */
export class ErrorDatoInspeccion extends Error {
  constructor(
    readonly campo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDatoInspeccion';
  }
}

/** La inspección ya tiene resultado (409, FR-012). */
export class ErrorInspeccionYaRegistrada extends Error {
  constructor() {
    super('La inspección ya tiene resultado');
    this.name = 'ErrorInspeccionYaRegistrada';
  }
}

/** Solo el inspector asignado registra el resultado (403, FR-010). */
export class ErrorNoEsInspectorAsignado extends Error {
  constructor() {
    super('La inspección no está asignada a este inspector');
    this.name = 'ErrorNoEsInspectorAsignado';
  }
}

const PATRON_CERTIFICADO = /^[A-Z0-9/-]{4,30}$/;

/** Número del certificado ITSE: mayúsculas y sin espacios, de 4 a 30 caracteres (aclaración de la 006). */
export const normalizarNumeroCertificado = (texto: string): string => {
  const numero = texto.replace(/\s+/g, '').toUpperCase();
  if (!PATRON_CERTIFICADO.test(numero)) {
    throw new ErrorDatoInspeccion(
      'numeroCertificado',
      'El número del certificado debe tener de 4 a 30 letras, números, guiones o barras',
    );
  }
  return numero;
};

export interface DatosInspeccion {
  readonly id: string;
  readonly numeroExpediente: string;
  readonly tipo: TipoInspeccion;
  readonly estado: EstadoInspeccion;
  readonly inspectorId: string | null;
  readonly programadaPara: Fecha | null;
  readonly resultado: ResultadoItse | null;
  readonly observaciones: string | null;
  readonly numeroCertificado: string | null;
  readonly certificadoEmitidoEn: Fecha | null;
  readonly registradaEn: Date | null;
}

/** Inspección ITSE (HU08, RF10): una por expediente y tipo, un solo inspector y un solo resultado. */
export class Inspeccion {
  private constructor(private readonly datos: DatosInspeccion) {}

  static reconstruir(datos: DatosInspeccion): Inspeccion {
    return new Inspeccion(datos);
  }

  aDatos(): DatosInspeccion {
    return this.datos;
  }

  get id(): string {
    return this.datos.id;
  }

  /** Asigna (o reasigna) inspector y fecha mientras no haya resultado (FR-008). */
  asignar(inspectorId: string, programadaPara: Fecha, hoy: Fecha): Inspeccion {
    if (this.datos.estado === 'REALIZADA') {
      throw new ErrorInspeccionYaRegistrada();
    }
    if (programadaPara < hoy) {
      throw new ErrorDatoInspeccion('programadaPara', 'La fecha programada no puede ser pasada');
    }
    return new Inspeccion({ ...this.datos, inspectorId, programadaPara, estado: 'ASIGNADA' });
  }

  /** El inspector asignado registra el resultado, una sola vez (FR-010 a FR-012). */
  registrarResultado(entrada: {
    readonly inspectorId: string;
    readonly resultado: ResultadoItse;
    readonly observaciones: string | null;
    readonly numeroCertificado: string | null;
    readonly certificadoEmitidoEn: Fecha | null;
    readonly cantidadFotos: number;
    readonly hoy: Fecha;
    readonly en: Date;
  }): Inspeccion {
    if (this.datos.estado === 'REALIZADA') {
      throw new ErrorInspeccionYaRegistrada();
    }
    if (this.datos.estado !== 'ASIGNADA' || this.datos.inspectorId !== entrada.inspectorId) {
      throw new ErrorNoEsInspectorAsignado();
    }
    if (entrada.cantidadFotos < MINIMO_FOTOS || entrada.cantidadFotos > MAXIMO_FOTOS) {
      throw new ErrorDatoInspeccion('fotos', 'Adjunta de 1 a 5 fotos');
    }
    const observaciones = entrada.observaciones?.trim() ?? '';
    if (observaciones.length > MAXIMO_OBSERVACIONES) {
      throw new ErrorDatoInspeccion(
        'observaciones',
        'Las observaciones deben tener como máximo 4000 caracteres',
      );
    }
    if (entrada.resultado === 'DESFAVORABLE' && observaciones === '') {
      throw new ErrorDatoInspeccion(
        'observaciones',
        'Escribe las observaciones del resultado desfavorable',
      );
    }
    let numeroCertificado: string | null = null;
    let certificadoEmitidoEn: Fecha | null = null;
    if (entrada.resultado === 'FAVORABLE') {
      if (entrada.numeroCertificado === null || entrada.certificadoEmitidoEn === null) {
        throw new ErrorDatoInspeccion(
          'numeroCertificado',
          'Escribe el número y la fecha de emisión del certificado ITSE',
        );
      }
      if (entrada.certificadoEmitidoEn > entrada.hoy) {
        throw new ErrorDatoInspeccion(
          'certificadoEmitidoEn',
          'La fecha de emisión del certificado no puede ser futura',
        );
      }
      numeroCertificado = normalizarNumeroCertificado(entrada.numeroCertificado);
      certificadoEmitidoEn = entrada.certificadoEmitidoEn;
    }
    return new Inspeccion({
      ...this.datos,
      estado: 'REALIZADA',
      resultado: entrada.resultado,
      observaciones: observaciones === '' ? null : observaciones,
      numeroCertificado,
      certificadoEmitidoEn,
      registradaEn: entrada.en,
    });
  }
}
