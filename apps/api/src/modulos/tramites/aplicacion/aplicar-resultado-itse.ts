import type { EstadoExpediente } from '../dominio/estado-publico';
import type { ExpedienteParaDecidir } from '../dominio/puertos/repositorio-decisiones';
import {
  ErrorTransicionNoAplicada,
  type PlanSistema,
  type ResultadoSistema,
  type TransicionesSistema,
} from './transiciones-sistema';

/** Lo que Trámites necesita del resultado (lo da Inspecciones por su fachada). */
export interface ResultadoInspeccion {
  readonly numeroExpediente: string;
  readonly tipo: 'PREVIA' | 'POSTERIOR' | 'BODEGA';
  readonly resultado: 'FAVORABLE' | 'DESFAVORABLE';
  readonly observaciones: string | null;
  readonly certificado: { readonly numero: string; readonly emitidoEn: string } | null;
}

/** Puerto: lectura del resultado de una inspección (adaptador de la fachada de Inspecciones). */
export interface ResultadosInspeccion {
  resultadoDe(inspeccionId: string): Promise<ResultadoInspeccion | null>;
}

const FINALES: ReadonlySet<EstadoExpediente> = new Set<EstadoExpediente>([
  'FINALIZADO',
  'DENEGADO',
  'DERIVADO_A_FISCALIZACION',
]);

const certificadoRegistrado = (
  numero: string,
  certificado: ResultadoInspeccion['certificado'],
) => ({
  tipo: 'CertificadoItseRegistrado',
  datos: {
    numeroExpediente: numero,
    numero: certificado?.numero ?? '',
    emitidoEn: certificado?.emitidoEn ?? '',
  },
});

/**
 * Avanza el expediente al consumir `ResultadoITSERegistrado` (FR-004 a FR-006 de la 006, research
 * §R-01). Las observaciones (texto libre) no viajan en el evento: se leen por la fachada.
 */
export class AplicarResultadoItse {
  constructor(
    private readonly d: {
      readonly transiciones: TransicionesSistema;
      readonly resultados: ResultadosInspeccion;
    },
  ) {}

  async ejecutar(evento: {
    readonly numeroExpediente: string;
    readonly inspeccionId: string;
  }): Promise<ResultadoSistema> {
    const resultado = await this.d.resultados.resultadoDe(evento.inspeccionId);
    if (resultado?.numeroExpediente !== evento.numeroExpediente) {
      throw new ErrorTransicionNoAplicada();
    }
    return this.d.transiciones.aplicar(evento.numeroExpediente, (expediente) =>
      planDe(expediente, resultado),
    );
  }
}

const planDe = (
  expediente: ExpedienteParaDecidir,
  resultado: ResultadoInspeccion,
): PlanSistema | null => {
  const favorable = resultado.resultado === 'FAVORABLE';
  const motivo = resultado.observaciones ?? 'Resultado desfavorable de la inspección ITSE';
  switch (resultado.tipo) {
    case 'PREVIA':
      if (expediente.estado !== 'EN_INSPECCION') {
        // Ya se emitió la licencia (FINALIZADO) o ya se denegó: el evento se repitió.
        return siYaAvanzo(expediente.estado);
      }
      return favorable
        ? {
            pasos: [],
            eventos: [
              {
                tipo: 'LicenciaSolicitada',
                datos: {
                  numeroExpediente: expediente.numero,
                  tipo: 'DEFINITIVA',
                  certificadoNumero: resultado.certificado?.numero ?? '',
                  certificadoEmitidoEn: resultado.certificado?.emitidoEn ?? '',
                },
              },
            ],
          }
        : { pasos: [{ accion: 'DENEGAR_POR_ITSE', comentario: motivo }] };
    case 'POSTERIOR':
      if (expediente.estado !== 'ITSE_POSTERIOR_PENDIENTE') {
        return siYaAvanzo(expediente.estado);
      }
      return favorable
        ? {
            pasos: [{ accion: 'FINALIZAR', comentario: 'Inspección ITSE posterior favorable' }],
            eventos: [certificadoRegistrado(expediente.numero, resultado.certificado)],
          }
        : { pasos: [{ accion: 'DERIVAR_A_FISCALIZACION', comentario: motivo }] };
    case 'BODEGA':
      if (expediente.estado !== 'LICENCIA_PROVISIONAL') {
        return siYaAvanzo(expediente.estado);
      }
      return favorable
        ? { pasos: [], eventos: [certificadoRegistrado(expediente.numero, resultado.certificado)] }
        : { pasos: [{ accion: 'DERIVAR_A_FISCALIZACION', comentario: motivo }] };
  }
};

const siYaAvanzo = (estado: EstadoExpediente): null => {
  if (FINALES.has(estado) || estado === 'LICENCIA_EMITIDA') {
    return null;
  }
  throw new ErrorTransicionNoAplicada();
};
