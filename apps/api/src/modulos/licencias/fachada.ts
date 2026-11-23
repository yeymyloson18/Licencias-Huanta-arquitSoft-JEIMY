// Fachada pública del módulo Licencias: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

import { fechaLima, sumarDias } from '../../compartido/dominio/fecha-lima';
import type { LectorLicenciasParaReportes, LicenciaParaReporte } from './dominio/lector-reportes';
import type { RepositorioLicencias } from './dominio/puertos';

export type { LicenciaParaReporte } from './dominio/lector-reportes';

/** Aviso del ITSE: 30 días antes del vencimiento (RF14, HU11). */
const DIAS_AVISO_ITSE = 30;

/** Operaciones de Licencias que usan otros módulos (por ahora, Trámites). Sin datos personales. */
export class FachadaLicencias {
  constructor(
    private readonly licencias: Pick<
      RepositorioLicencias,
      'vigenteDe' | 'avisarCertificadosPorVencer'
    >,
    private readonly reloj: { ahora(): Date } = { ahora: () => new Date() },
    private readonly reportes?: LectorLicenciasParaReportes,
  ) {}

  /** Licencias vigentes, por número (reporte de la jefatura, 007). */
  licenciasVigentes(codigoReceta?: string): Promise<LicenciaParaReporte[]> {
    return this.paraReportes().vigentes(codigoReceta);
  }

  /** Licencias con el certificado ITSE que vence en 30 días o menos (reporte, 007). */
  itsePorVencer(codigoReceta?: string): Promise<LicenciaParaReporte[]> {
    const hoy = fechaLima(this.reloj.ahora());
    return this.paraReportes().itsePorVencer(hoy, sumarDias(hoy, DIAS_AVISO_ITSE), codigoReceta);
  }

  private paraReportes(): LectorLicenciasParaReportes {
    if (this.reportes === undefined) {
      throw new Error('La fachada de Licencias no tiene el lector para reportes');
    }
    return this.reportes;
  }

  /**
   * Publica `ItsePorVencer` por cada certificado que vence en 30 días o menos, una sola vez (FR-034).
   * Lo llama el reloj de plazos. Devuelve cuántos avisó.
   */
  avisarCertificadosPorVencer(): Promise<number> {
    const en = this.reloj.ahora();
    const hoy = fechaLima(en);
    return this.licencias.avisarCertificadosPorVencer(hoy, sumarDias(hoy, DIAS_AVISO_ITSE), en);
  }

  /** Número de la licencia vigente del expediente, o `null` (consulta pública y detalle, 006). */
  async numeroDeLicencia(numeroExpediente: string): Promise<string | null> {
    return (await this.licencias.vigenteDe(numeroExpediente))?.numero ?? null;
  }
}
