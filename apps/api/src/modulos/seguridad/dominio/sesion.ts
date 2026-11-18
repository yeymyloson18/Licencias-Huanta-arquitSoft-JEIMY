export type ResultadoRenovacion =
  'ROTADA' | 'REUTILIZADA' | 'CARRERA' | 'VENCIDA' | 'INACTIVA' | 'REVOCADA' | 'DESCONOCIDA';

/** Compara dos huellas en tiempo constante (lo implementa un puerto). */
export type ComparadorHuellas = (a: string, b: string) => boolean;

const OCHO_HORAS_MS = 8 * 60 * 60 * 1000;
const TREINTA_MINUTOS_MS = 30 * 60 * 1000;
const MARGEN_CARRERA_MS = 10 * 1000;

export interface DatosNuevaSesion {
  readonly id: string;
  readonly usuarioId: string;
  readonly refreshHash: string;
  readonly creadaEn: Date;
}

export interface DatosSesion {
  readonly id: string;
  readonly usuarioId: string;
  readonly refreshHash: string;
  readonly refreshAnteriorHash: string | undefined;
  readonly rotadaEn: Date | undefined;
  readonly creadaEn: Date;
  readonly venceMaximoEn: Date;
  readonly ultimaActividadEn: Date;
  readonly revocadaEn: Date | undefined;
}

/**
 * Sesión del personal en un dispositivo (research.md §R-06): dura como máximo 8 horas (FR-003), no
 * se renueva si pasaron más de 30 minutos desde la última renovación (FR-003a) y rota el refresh
 * token en cada renovación. Presentar el refresh anterior más de 10 s después de rotarlo es una
 * reutilización (probable robo); dentro de 10 s, dos pestañas que renovaron a la vez.
 */
export class Sesion {
  private constructor(
    readonly id: string,
    readonly usuarioId: string,
    private hashVigente: string,
    private hashAnterior: string | undefined,
    private rotacion: Date | undefined,
    readonly creadaEn: Date,
    readonly venceMaximoEn: Date,
    private actividad: Date,
    private revocacion: Date | undefined,
  ) {}

  static crear(datos: DatosNuevaSesion): Sesion {
    return new Sesion(
      datos.id,
      datos.usuarioId,
      datos.refreshHash,
      undefined,
      undefined,
      datos.creadaEn,
      new Date(datos.creadaEn.getTime() + OCHO_HORAS_MS),
      datos.creadaEn,
      undefined,
    );
  }

  static reconstruir(datos: DatosSesion): Sesion {
    return new Sesion(
      datos.id,
      datos.usuarioId,
      datos.refreshHash,
      datos.refreshAnteriorHash,
      datos.rotadaEn,
      datos.creadaEn,
      datos.venceMaximoEn,
      datos.ultimaActividadEn,
      datos.revocadaEn,
    );
  }

  get refreshHash(): string {
    return this.hashVigente;
  }
  get refreshAnteriorHash(): string | undefined {
    return this.hashAnterior;
  }
  get rotadaEn(): Date | undefined {
    return this.rotacion;
  }
  get ultimaActividadEn(): Date {
    return this.actividad;
  }
  get revocadaEn(): Date | undefined {
    return this.revocacion;
  }
  get revocada(): boolean {
    return this.revocacion !== undefined;
  }

  /** Si el refresh presentado es el vigente o el anterior de esta sesión. */
  reconoce(hashPresentado: string, iguales: ComparadorHuellas): boolean {
    return (
      iguales(hashPresentado, this.hashVigente) ||
      (this.hashAnterior !== undefined && iguales(hashPresentado, this.hashAnterior))
    );
  }

  renovar(
    hashPresentado: string,
    hashNuevo: string,
    ahora: Date,
    iguales: ComparadorHuellas,
  ): ResultadoRenovacion {
    if (this.revocacion !== undefined) {
      return 'REVOCADA';
    }
    if (ahora.getTime() >= this.venceMaximoEn.getTime()) {
      return 'VENCIDA';
    }
    if (ahora.getTime() - this.actividad.getTime() > TREINTA_MINUTOS_MS) {
      return 'INACTIVA';
    }
    if (iguales(hashPresentado, this.hashVigente)) {
      this.rotar(hashNuevo, ahora);
      return 'ROTADA';
    }
    if (this.hashAnterior !== undefined && iguales(hashPresentado, this.hashAnterior)) {
      const desdeRotacion = ahora.getTime() - (this.rotacion ?? ahora).getTime();
      return desdeRotacion > MARGEN_CARRERA_MS ? 'REUTILIZADA' : 'CARRERA';
    }
    return 'DESCONOCIDA';
  }

  /** Reemplaza el refresh vigente (al renovar o al cambiar la clave). */
  rotar(hashNuevo: string, ahora: Date): void {
    this.hashAnterior = this.hashVigente;
    this.hashVigente = hashNuevo;
    this.rotacion = ahora;
    this.actividad = ahora;
  }

  revocar(ahora: Date): void {
    this.revocacion ??= ahora;
  }
}
