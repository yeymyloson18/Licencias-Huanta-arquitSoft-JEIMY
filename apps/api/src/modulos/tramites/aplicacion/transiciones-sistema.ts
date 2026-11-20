import type { EstadoExpediente } from '../dominio/estado-publico';
import { type AccionExpediente, siguienteEstado } from '../dominio/maquina-estados';
import type { Reloj } from '../dominio/puertos/reloj';
import type {
  Decision,
  EventoParaPublicar,
  ExpedienteParaDecidir,
  RepositorioDecisiones,
} from '../dominio/puertos/repositorio-decisiones';

/** El cambio no se pudo aplicar en este intento; el despachador reintenta el evento. */
export class ErrorTransicionNoAplicada extends Error {
  constructor() {
    super('No se pudo aplicar la transición del sistema');
    this.name = 'ErrorTransicionNoAplicada';
  }
}

export interface PasoSistema {
  readonly accion: AccionExpediente;
  readonly comentario: string;
}

export interface PlanSistema {
  readonly pasos: readonly PasoSistema[];
  /** Eventos además de un `EstadoExpedienteCambiado` por paso (por ejemplo, `InspeccionRequerida`). */
  readonly eventos?: readonly EventoParaPublicar[];
  readonly cambios?: Decision['cambios'];
}

export type ResultadoSistema = 'APLICADO' | 'YA_APLICADO';

/**
 * Aplica, en una sola transacción, una cadena de acciones del sistema (006): un registro de historial
 * sin usuario y un `EstadoExpedienteCambiado` por paso. `planear` decide los pasos según el estado
 * actual; devuelve `null` si el evento ya se aplicó (entrega "al menos una vez") y lanza si el
 * expediente está en un estado inesperado (el despachador lo reintenta).
 */
export class TransicionesSistema {
  constructor(
    private readonly d: { readonly decisiones: RepositorioDecisiones; readonly reloj: Reloj },
  ) {}

  async aplicar(
    numeroExpediente: string,
    planear: (expediente: ExpedienteParaDecidir) => PlanSistema | null,
  ): Promise<ResultadoSistema> {
    for (let intento = 0; intento < 2; intento += 1) {
      const expediente = await this.d.decisiones.obtenerParaDecidir(numeroExpediente);
      if (expediente === null) {
        throw new ErrorTransicionNoAplicada();
      }
      const plan = planear(expediente);
      if (plan === null) {
        return 'YA_APLICADO';
      }
      if (await this.d.decisiones.aplicar(this.decision(expediente, plan))) {
        return 'APLICADO';
      }
      // Otro cambio ganó entre la lectura y el guardado: se vuelve a leer una vez.
    }
    throw new ErrorTransicionNoAplicada();
  }

  private decision(expediente: ExpedienteParaDecidir, plan: PlanSistema): Decision {
    let estado: EstadoExpediente = expediente.estado;
    const historial: {
      estadoAnterior: EstadoExpediente;
      estadoNuevo: EstadoExpediente;
      comentario: string;
    }[] = [];
    for (const paso of plan.pasos) {
      const nuevo = siguienteEstado(estado, expediente.ruta, paso.accion);
      historial.push({ estadoAnterior: estado, estadoNuevo: nuevo, comentario: paso.comentario });
      estado = nuevo;
    }
    const ultimo = historial.at(-1);
    if (ultimo === undefined) {
      throw new Error('Un plan del sistema necesita al menos un paso');
    }
    return {
      expedienteId: expediente.id,
      numero: expediente.numero,
      estadoEsperado: expediente.estado,
      versionEsperada: expediente.version,
      estadoNuevo: estado,
      usuarioId: null,
      comentario: ultimo.comentario,
      auditoria: null,
      historial,
      ...(plan.cambios === undefined ? {} : { cambios: plan.cambios }),
      eventos: [
        ...historial.map((paso) => ({
          tipo: 'EstadoExpedienteCambiado',
          datos: {
            numeroExpediente: expediente.numero,
            estadoAnterior: paso.estadoAnterior,
            estadoNuevo: paso.estadoNuevo,
          },
        })),
        ...(plan.eventos ?? []),
      ],
      en: this.d.reloj.ahora(),
    };
  }
}
