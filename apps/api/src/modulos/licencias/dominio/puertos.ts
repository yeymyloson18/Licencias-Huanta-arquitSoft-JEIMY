import type { Fecha } from '../../../compartido/dominio/fecha-lima';
import type { DatosExpedienteParaLicencia, DatosLicencia, Licencia } from './licencia';

/** Puerto: la hora actual. */
export interface Reloj {
  ahora(): Date;
}

/** Puerto: bytes aleatorios criptográficamente seguros (código de verificación). */
export interface GeneradorAleatorio {
  bytes(cantidad: number): Uint8Array;
}

/** Puerto: datos del expediente para la licencia (adaptador de la fachada de Trámites). */
export interface ExpedientesParaLicencia {
  datosParaLicencia(numeroExpediente: string): Promise<DatosExpedienteParaLicencia | null>;
}

export type ResultadoEmision =
  | { readonly tipo: 'EMITIDA'; readonly licencia: Licencia }
  | { readonly tipo: 'YA_EXISTIA'; readonly licencia: Licencia };

/**
 * Puerto: `licencias.licencia`, `certificado_itse` y `auditoria`. `emitir` guarda en una transacción la
 * licencia (con su certificado, si hay), la auditoría con usuario NULL y el evento `LicenciaEmitida`;
 * si el expediente ya tiene una vigente (índice único), devuelve esa sin escribir nada.
 */
export interface RepositorioLicencias {
  vigenteDe(numeroExpediente: string): Promise<Licencia | null>;
  porNumero(numero: string): Promise<Licencia | null>;
  porCodigo(codigoVerificacion: string): Promise<Licencia | null>;
  emitir(armar: (correlativo: number) => Licencia): Promise<ResultadoEmision>;
  /** Vuelve a publicar `LicenciaEmitida` (si Trámites no alcanzó a avanzar la primera vez). */
  publicarEmitida(licencia: Licencia): Promise<void>;
  /** Registra el certificado en la licencia vigente del expediente; idempotente por número. */
  registrarCertificado(
    numeroExpediente: string,
    certificado: { readonly numero: string; readonly emitidoEn: Fecha },
  ): Promise<'REGISTRADO' | 'YA_EXISTIA' | 'SIN_LICENCIA'>;
  /**
   * Marca el aviso de los certificados de licencias vigentes que vencen entre `desde` y `hasta` y aún
   * no fueron avisados, y publica `ItsePorVencer` por cada uno, en una sola sentencia (FR-034).
   */
  avisarCertificadosPorVencer(desde: Fecha, hasta: Fecha, en: Date): Promise<number>;
}

/** Puerto: PDF de la licencia con el QR que apunta a la verificación pública (FR-017). */
export interface PdfLicencia {
  generar(licencia: DatosLicencia, urlVerificacion: string): Promise<Uint8Array>;
}

export interface ReservaVerificacion {
  readonly permitido: boolean;
  readonly segundosRestantes: number;
}

/** No se puede contar los intentos: la verificación falla cerrada (503). */
export class ErrorLimitadorNoDisponible extends Error {
  constructor() {
    super('No se pueden contar los intentos de verificación');
    this.name = 'ErrorLimitadorNoDisponible';
  }
}

/** Puerto: intentos fallidos de verificación por origen (research §R-12). */
export interface LimitadorVerificaciones {
  reservar(origen: string): Promise<ReservaVerificacion>;
  liberar(origen: string): Promise<void>;
}
