import type { TipoDocumento } from './identidad-administrado';

// Verificación de identidad del administrado en línea (CU03, research §R-03 de la 004). Solo guarda
// huellas HMAC: nunca el documento, el RUC ni el celular (principio VII). Si el servicio confirmó la
// identidad, lleva un código de 6 dígitos con las mismas reglas que el del personal (002): vence a
// los 5 minutos, admite 5 intentos y sirve una sola vez. Estados: pendiente → confirmada | vencida.

export type ResultadoServicioRegistrado = 'VALIDO' | 'NO_VALIDO' | 'NO_DISPONIBLE';
export type ResultadoVerificacionCodigo = 'CORRECTO' | 'INCORRECTO' | 'VENCIDO' | 'AGOTADO';

const VIDA_MS = 5 * 60 * 1000;
const MAXIMO_INTENTOS = 5;

export interface HuellasIdentidad {
  readonly tipoDocumento: TipoDocumento;
  readonly documentoHmac: Uint8Array;
  readonly rucHmac: Uint8Array;
  readonly celularHmac: Uint8Array;
  readonly representanteHmac: Uint8Array | null;
}

export interface DatosVerificacionIdentidad extends HuellasIdentidad {
  readonly id: string;
  readonly codigoHash: string;
  readonly intentos: number;
  readonly venceEn: Date;
  readonly confirmadaEn: Date | null;
}

export class VerificacionIdentidad {
  private constructor(
    readonly id: string,
    readonly huellas: HuellasIdentidad,
    readonly codigoHash: string,
    private numeroIntentos: number,
    private vencimiento: Date,
    private confirmacion: Date | null,
  ) {}

  static crear(datos: {
    id: string;
    huellas: HuellasIdentidad;
    codigoHash: string;
    creadaEn: Date;
  }): VerificacionIdentidad {
    return new VerificacionIdentidad(
      datos.id,
      datos.huellas,
      datos.codigoHash,
      0,
      new Date(datos.creadaEn.getTime() + VIDA_MS),
      null,
    );
  }

  static reconstruir(datos: DatosVerificacionIdentidad): VerificacionIdentidad {
    const { id, codigoHash, intentos, venceEn, confirmadaEn, ...huellas } = datos;
    return new VerificacionIdentidad(id, huellas, codigoHash, intentos, venceEn, confirmadaEn);
  }

  get intentos(): number {
    return this.numeroIntentos;
  }
  get venceEn(): Date {
    return this.vencimiento;
  }
  get confirmadaEn(): Date | null {
    return this.confirmacion;
  }

  /** `esCorrecto`: si la huella del código presentado coincide con `codigoHash`. */
  verificar(esCorrecto: boolean, ahora: Date): ResultadoVerificacionCodigo {
    if (this.confirmacion !== null || ahora.getTime() >= this.vencimiento.getTime()) {
      return 'VENCIDO';
    }
    if (this.numeroIntentos >= MAXIMO_INTENTOS) {
      return 'AGOTADO';
    }
    if (esCorrecto) {
      this.confirmacion = ahora;
      return 'CORRECTO';
    }
    this.numeroIntentos += 1;
    return 'INCORRECTO';
  }

  /** Al pedir otro código, el anterior deja de valer (contracts/identidad-y-solicitud.md). */
  vencer(ahora: Date): void {
    if (this.confirmacion === null && ahora.getTime() < this.vencimiento.getTime()) {
      this.vencimiento = ahora;
    }
  }
}

/** Compara dos huellas byte a byte (no es secreta: es la huella de un dato ya enviado). */
export const mismaHuella = (a: Uint8Array | null, b: Uint8Array | null): boolean => {
  if (a === null || b === null) {
    return a === b;
  }
  return a.length === b.length && a.every((byte, indice) => byte === b[indice]);
};
