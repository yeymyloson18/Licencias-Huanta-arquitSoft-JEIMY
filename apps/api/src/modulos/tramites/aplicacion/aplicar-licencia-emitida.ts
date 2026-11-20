import type { EstadoExpediente } from '../dominio/estado-publico';
import type { ExpedienteParaDecidir } from '../dominio/puertos/repositorio-decisiones';
import {
  ErrorTransicionNoAplicada,
  type PlanSistema,
  type ResultadoSistema,
  type TransicionesSistema,
} from './transiciones-sistema';

/** Estados en los que el expediente ya tiene su licencia: el evento repetido no hace nada. */
export const ESTADOS_CON_LICENCIA: ReadonlySet<EstadoExpediente> = new Set<EstadoExpediente>([
  'LICENCIA_EMITIDA',
  'LICENCIA_PROVISIONAL',
  'ITSE_POSTERIOR_PENDIENTE',
  'FINALIZADO',
  'DERIVADO_A_FISCALIZACION',
]);

const inspeccionRequerida = (numero: string, tipo: 'POSTERIOR' | 'BODEGA') => ({
  tipo: 'InspeccionRequerida',
  datos: { numeroExpediente: numero, tipo },
});

/**
 * Avanza el expediente al consumir `LicenciaEmitida` (FR-001, FR-003 y FR-004 de la 006, research
 * §R-01): A → LICENCIA_EMITIDA → ITSE_POSTERIOR_PENDIENTE con una inspección POSTERIOR; B →
 * LICENCIA_EMITIDA → FINALIZADO; C → LICENCIA_PROVISIONAL con una inspección BODEGA.
 */
export class AplicarLicenciaEmitida {
  constructor(private readonly transiciones: TransicionesSistema) {}

  ejecutar(evento: {
    readonly numeroExpediente: string;
    readonly numeroLicencia: string;
  }): Promise<ResultadoSistema> {
    return this.transiciones.aplicar(evento.numeroExpediente, (expediente) =>
      planDe(expediente, evento.numeroLicencia),
    );
  }
}

const planDe = (expediente: ExpedienteParaDecidir, numeroLicencia: string): PlanSistema | null => {
  const emitida = `Licencia ${numeroLicencia} emitida`;
  if (expediente.ruta === 'A' && expediente.estado === 'APROBADO') {
    return {
      pasos: [
        { accion: 'EMITIR_LICENCIA', comentario: emitida },
        { accion: 'ESPERAR_ITSE_POSTERIOR', comentario: 'Espera la inspección ITSE posterior' },
      ],
      eventos: [inspeccionRequerida(expediente.numero, 'POSTERIOR')],
    };
  }
  if (expediente.ruta === 'B' && expediente.estado === 'EN_INSPECCION') {
    return {
      pasos: [
        { accion: 'EMITIR_LICENCIA', comentario: emitida },
        { accion: 'FINALIZAR', comentario: 'Trámite finalizado' },
      ],
    };
  }
  if (expediente.ruta === 'C' && expediente.estado === 'APROBADO') {
    return {
      pasos: [{ accion: 'EMITIR_LICENCIA_PROVISIONAL', comentario: emitida }],
      eventos: [inspeccionRequerida(expediente.numero, 'BODEGA')],
    };
  }
  if (ESTADOS_CON_LICENCIA.has(expediente.estado)) {
    return null;
  }
  throw new ErrorTransicionNoAplicada();
};
