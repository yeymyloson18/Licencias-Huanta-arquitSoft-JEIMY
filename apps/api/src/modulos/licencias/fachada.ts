// Fachada pública del módulo Licencias: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

import type { RepositorioLicencias } from './dominio/puertos';

/** Operaciones de Licencias que usan otros módulos (por ahora, Trámites). Sin datos personales. */
export class FachadaLicencias {
  constructor(private readonly licencias: Pick<RepositorioLicencias, 'vigenteDe'>) {}

  /** Número de la licencia vigente del expediente, o `null` (consulta pública y detalle, 006). */
  async numeroDeLicencia(numeroExpediente: string): Promise<string | null> {
    return (await this.licencias.vigenteDe(numeroExpediente))?.numero ?? null;
  }
}
