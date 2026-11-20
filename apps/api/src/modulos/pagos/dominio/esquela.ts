import { ErrorDatoPagos, ErrorEsquelaNoPagada, ErrorEsquelaYaPagada } from './errores';
import type { NumeroRecibo } from './numero-recibo';

const PATRON_EXPEDIENTE = /^EXP-[0-9]{4}-[0-9]{6}$/;
const LARGO_MINIMO_MOTIVO = 10;
const LARGO_MAXIMO_MOTIVO = 500;

export interface Pago {
  readonly numeroRecibo: string;
  readonly pagadaEn: Date;
  readonly registradoPor: string;
}

export interface DatosEsquela {
  readonly codigo: string;
  readonly numeroExpediente: string;
  readonly codigoReceta: string;
  readonly concepto: string;
  /** Soles con dos decimales, por ejemplo "177.10". */
  readonly monto: string;
  readonly generadaEn: Date;
  readonly pago: Pago | null;
}

/** El código de la esquela de un expediente (ADR-004: una por expediente). */
export const codigoEsquelaDe = (numeroExpediente: string): string => `ESQ-${numeroExpediente}`;

/**
 * Esquela de pago (RF11, ADR-004): código `ESQ-<expediente>`, monto copiado de la tasa al confirmar el
 * riesgo (no cambia después) y, como máximo, un pago. El recibo solo se corrige si está pagada.
 */
export class Esquela {
  private constructor(private readonly datos: DatosEsquela) {}

  static generar(entrada: {
    readonly numeroExpediente: string;
    readonly codigoReceta: string;
    readonly concepto: string;
    readonly monto: string;
    readonly en: Date;
  }): Esquela {
    if (!PATRON_EXPEDIENTE.test(entrada.numeroExpediente)) {
      throw new ErrorDatoPagos('numeroExpediente', 'El número de expediente no es válido');
    }
    const monto = Number(entrada.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new ErrorDatoPagos('monto', 'El monto de la esquela debe ser mayor que 0');
    }
    if (entrada.concepto.trim() === '' || entrada.codigoReceta.trim() === '') {
      throw new ErrorDatoPagos('concepto', 'La esquela necesita el concepto y la licencia');
    }
    return new Esquela({
      codigo: codigoEsquelaDe(entrada.numeroExpediente),
      numeroExpediente: entrada.numeroExpediente,
      codigoReceta: entrada.codigoReceta,
      concepto: entrada.concepto.trim(),
      monto: monto.toFixed(2),
      generadaEn: entrada.en,
      pago: null,
    });
  }

  static reconstruir(datos: DatosEsquela): Esquela {
    return new Esquela(datos);
  }

  get codigo(): string {
    return this.datos.codigo;
  }

  get numeroExpediente(): string {
    return this.datos.numeroExpediente;
  }

  get pagada(): boolean {
    return this.datos.pago !== null;
  }

  aDatos(): DatosEsquela {
    return this.datos;
  }

  /** Registra el pago una sola vez (FR-022). */
  registrarPago(recibo: NumeroRecibo, cajero: string, en: Date): Esquela {
    if (this.datos.pago !== null) {
      throw new ErrorEsquelaYaPagada();
    }
    return new Esquela({
      ...this.datos,
      pago: { numeroRecibo: recibo.valor, pagadaEn: en, registradoPor: cajero },
    });
  }

  /**
   * Corrige el número de recibo de una esquela pagada (FR-026). Exige un motivo de 10 a 500
   * caracteres y un recibo distinto. Devuelve la esquela corregida y el recibo anterior.
   */
  corregirRecibo(
    recibo: NumeroRecibo,
    motivo: string,
  ): { readonly esquela: Esquela; readonly reciboAnterior: string; readonly motivo: string } {
    if (this.datos.pago === null) {
      throw new ErrorEsquelaNoPagada();
    }
    const limpio = motivo.trim();
    if (limpio.length < LARGO_MINIMO_MOTIVO || limpio.length > LARGO_MAXIMO_MOTIVO) {
      throw new ErrorDatoPagos('motivo', 'El motivo debe tener entre 10 y 500 caracteres');
    }
    if (recibo.valor === this.datos.pago.numeroRecibo) {
      throw new ErrorDatoPagos('numeroRecibo', 'El recibo nuevo es igual al actual');
    }
    return {
      esquela: new Esquela({
        ...this.datos,
        pago: { ...this.datos.pago, numeroRecibo: recibo.valor },
      }),
      reciboAnterior: this.datos.pago.numeroRecibo,
      motivo: limpio,
    };
  }
}
