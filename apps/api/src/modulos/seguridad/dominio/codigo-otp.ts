export type ResultadoVerificacionOtp = 'CORRECTO' | 'INCORRECTO' | 'VENCIDO' | 'AGOTADO';

const VIDA_MS = 5 * 60 * 1000;
const MAXIMO_INTENTOS = 5;

export interface DatosNuevoCodigoOtp {
  readonly id: string;
  readonly usuarioId: string;
  readonly destinoHmac: Uint8Array;
  readonly codigoHash: string;
  readonly creadoEn: Date;
}

export interface DatosCodigoOtp {
  readonly id: string;
  readonly usuarioId: string;
  readonly destinoHmac: Uint8Array;
  readonly codigoHash: string;
  readonly intentos: number;
  readonly venceEn: Date;
  readonly usadoEn: Date | undefined;
}

/**
 * Código de un solo uso del inicio de sesión (FR-002): vence a los 5 minutos, admite 5 intentos y
 * sirve una sola vez. Solo se guarda su huella; el caso de uso compara la huella en tiempo constante
 * y le pasa el resultado a `verificar`. Estados: vigente → usado | vencido.
 */
export class CodigoOtp {
  private constructor(
    readonly id: string,
    readonly usuarioId: string,
    readonly destinoHmac: Uint8Array,
    readonly codigoHash: string,
    private numeroIntentos: number,
    private vencimiento: Date,
    private uso: Date | undefined,
  ) {}

  static crear(datos: DatosNuevoCodigoOtp): CodigoOtp {
    return new CodigoOtp(
      datos.id,
      datos.usuarioId,
      datos.destinoHmac,
      datos.codigoHash,
      0,
      new Date(datos.creadoEn.getTime() + VIDA_MS),
      undefined,
    );
  }

  static reconstruir(datos: DatosCodigoOtp): CodigoOtp {
    return new CodigoOtp(
      datos.id,
      datos.usuarioId,
      datos.destinoHmac,
      datos.codigoHash,
      datos.intentos,
      datos.venceEn,
      datos.usadoEn,
    );
  }

  get intentos(): number {
    return this.numeroIntentos;
  }
  get venceEn(): Date {
    return this.vencimiento;
  }
  get usadoEn(): Date | undefined {
    return this.uso;
  }

  /** `esCorrecto`: si la huella del código presentado coincide con `codigoHash`. */
  verificar(esCorrecto: boolean, ahora: Date): ResultadoVerificacionOtp {
    if (this.uso !== undefined || ahora.getTime() >= this.vencimiento.getTime()) {
      return 'VENCIDO';
    }
    if (this.numeroIntentos >= MAXIMO_INTENTOS) {
      return 'AGOTADO';
    }
    if (esCorrecto) {
      this.uso = ahora;
      return 'CORRECTO';
    }
    this.numeroIntentos += 1;
    return 'INCORRECTO';
  }

  /** Lo deja vencido antes de tiempo (al pedir un código nuevo, solo vale el último). */
  vencer(ahora: Date): void {
    if (ahora.getTime() < this.vencimiento.getTime()) {
      this.vencimiento = ahora;
    }
  }
}
