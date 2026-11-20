// Fachada pública del módulo Inspecciones: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

import type { RepositorioInspecciones } from './dominio/puertos';

/** Resultado de una inspección para Trámites (el texto de las observaciones no viaja en eventos). */
export interface ResultadoInspeccionDto {
  readonly numeroExpediente: string;
  readonly tipo: 'PREVIA' | 'POSTERIOR' | 'BODEGA';
  readonly resultado: 'FAVORABLE' | 'DESFAVORABLE';
  readonly observaciones: string | null;
  readonly certificado: { readonly numero: string; readonly emitidoEn: string } | null;
}

export class FachadaInspecciones {
  constructor(private readonly inspecciones: Pick<RepositorioInspecciones, 'obtener'>) {}

  /** `null` si no existe o todavía no tiene resultado. */
  async resultadoDe(inspeccionId: string): Promise<ResultadoInspeccionDto | null> {
    const inspeccion = await this.inspecciones.obtener(inspeccionId);
    const datos = inspeccion?.aDatos();
    if (datos?.resultado === undefined || datos.resultado === null) {
      return null;
    }
    return {
      numeroExpediente: datos.numeroExpediente,
      tipo: datos.tipo,
      resultado: datos.resultado,
      observaciones: datos.observaciones,
      certificado:
        datos.numeroCertificado === null || datos.certificadoEmitidoEn === null
          ? null
          : { numero: datos.numeroCertificado, emitidoEn: datos.certificadoEmitidoEn },
    };
  }
}
