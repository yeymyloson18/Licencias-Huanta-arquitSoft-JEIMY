// Fachada pública del módulo Licencias: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

import { fechaLima, sumarDias } from '../../compartido/dominio/fecha-lima';
import type { RepositorioLicencias } from './dominio/puertos';

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
  ) {}

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
