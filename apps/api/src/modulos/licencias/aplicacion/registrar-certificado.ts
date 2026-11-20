import type { Fecha } from '../../../compartido/dominio/fecha-lima';
import type { RepositorioLicencias } from '../dominio/puertos';

/** El expediente todavía no tiene licencia vigente: el evento se reintenta. */
export class ErrorSinLicenciaVigente extends Error {
  constructor() {
    super('El expediente no tiene una licencia vigente');
    this.name = 'ErrorSinLicenciaVigente';
  }
}

/**
 * Registra el certificado ITSE en la licencia vigente al consumir `CertificadoItseRegistrado` (FR-005 y
 * FR-006 de la 006). Idempotente por número de certificado.
 */
export class RegistrarCertificado {
  constructor(private readonly licencias: Pick<RepositorioLicencias, 'registrarCertificado'>) {}

  async ejecutar(evento: {
    readonly numeroExpediente: string;
    readonly numero: string;
    readonly emitidoEn: Fecha;
  }): Promise<'REGISTRADO' | 'YA_EXISTIA'> {
    const resultado = await this.licencias.registrarCertificado(evento.numeroExpediente, {
      numero: evento.numero,
      emitidoEn: evento.emitidoEn,
    });
    if (resultado === 'SIN_LICENCIA') {
      throw new ErrorSinLicenciaVigente();
    }
    return resultado;
  }
}
