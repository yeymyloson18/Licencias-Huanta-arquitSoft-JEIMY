import { ErrorValidacionSolicitud } from '../dominio/errores';
import type { EstadoExpediente } from '../dominio/estado-publico';
import { mismoGrupo } from '../dominio/grupo-licencia';
import {
  type AccionExpediente,
  ErrorTransicionInvalida,
  estadoTrasConfirmarRiesgo,
  siguienteEstado,
} from '../dominio/maquina-estados';
import type { CatalogoEvaluacion } from '../dominio/puertos/catalogo-evaluacion';
import type { Reloj } from '../dominio/puertos/reloj';
import type {
  Decision,
  EventoParaPublicar,
  ExpedienteParaDecidir,
  RepositorioDecisiones,
} from '../dominio/puertos/repositorio-decisiones';
import { validarTextoDecision } from '../dominio/texto-decision';
import { ErrorExpedienteNoEncontrado, ErrorVersionCambiada, ErrorYaObservado } from './errores';

// Decisiones del evaluador (CU13 de la 005, research §R-03 y §R-05). Cada decisión se valida con la
// máquina de estados del dominio y se guarda con un UPDATE condicional por estado y versión, junto con
// su historial, su auditoría y sus eventos. Ningún error lleva datos personales.

export interface DependenciasDecisiones {
  readonly decisiones: RepositorioDecisiones;
  readonly reloj: Reloj;
}

/** Quién decide y sobre qué versión del expediente (cabecera `If-Match`). */
export interface Decisor {
  readonly numero: string;
  readonly version: number;
  readonly usuarioId: string;
}

const eventoCambioEstado = (
  numero: string,
  anterior: EstadoExpediente,
  nuevo: EstadoExpediente,
): EventoParaPublicar => ({
  tipo: 'EstadoExpedienteCambiado',
  datos: { numeroExpediente: numero, estadoAnterior: anterior, estadoNuevo: nuevo },
});

/** Base común: lee, valida la transición y la versión, guarda y resuelve las carreras. */
abstract class DecisionEvaluador {
  constructor(protected readonly d: DependenciasDecisiones) {}

  protected async leer(decisor: Decisor, accion: AccionExpediente): Promise<ExpedienteParaDecidir> {
    const expediente = await this.d.decisiones.obtenerParaDecidir(decisor.numero);
    if (expediente === null) {
      throw new ErrorExpedienteNoEncontrado();
    }
    siguienteEstado(expediente.estado, expediente.ruta, accion);
    if (expediente.version !== decisor.version) {
      throw new ErrorVersionCambiada();
    }
    return expediente;
  }

  /** Guarda la decisión; si otro cambio ganó, explica si cambió el estado (409) o la versión (412). */
  protected async guardar(decision: Decision, accion: AccionExpediente): Promise<void> {
    if (await this.d.decisiones.aplicar(decision)) {
      return;
    }
    const actual = await this.d.decisiones.obtenerParaDecidir(decision.numero);
    if (actual === null) {
      throw new ErrorExpedienteNoEncontrado();
    }
    if (actual.estado !== decision.estadoEsperado) {
      throw new ErrorTransicionInvalida(actual.estado, accion);
    }
    throw new ErrorVersionCambiada();
  }

  protected base(
    expediente: ExpedienteParaDecidir,
    decisor: Decisor,
    estadoNuevo: EstadoExpediente,
  ): Pick<
    Decision,
    | 'expedienteId'
    | 'numero'
    | 'estadoEsperado'
    | 'versionEsperada'
    | 'estadoNuevo'
    | 'usuarioId'
    | 'en'
  > {
    return {
      expedienteId: expediente.id,
      numero: expediente.numero,
      estadoEsperado: expediente.estado,
      versionEsperada: expediente.version,
      estadoNuevo,
      usuarioId: decisor.usuarioId,
      en: this.d.reloj.ahora(),
    };
  }
}

/** REGISTRADO → EN_EVALUACION; registra quién empezó la revisión (FR-002). */
export class IniciarEvaluacion extends DecisionEvaluador {
  async ejecutar(decisor: Decisor): Promise<void> {
    const expediente = await this.leer(decisor, 'INICIAR_EVALUACION');
    const nuevo = siguienteEstado(expediente.estado, expediente.ruta, 'INICIAR_EVALUACION');
    await this.guardar(
      {
        ...this.base(expediente, decisor, nuevo),
        comentario: 'Revisión iniciada',
        auditoria: { accion: 'INICIAR_EVALUACION', detalle: null },
        cambios: { evaluadorId: decisor.usuarioId },
        eventos: [eventoCambioEstado(expediente.numero, expediente.estado, nuevo)],
      },
      'INICIAR_EVALUACION',
    );
  }
}

/**
 * Confirma la licencia presentada o la corrige a otra vigente del mismo grupo (FR-003 a FR-006).
 * Con tasa: PENDIENTE_PAGO y el evento `EsquelaSolicitada` en la misma transacción (research §R-01).
 * Con tasa 0.00: PAGADO sin esquela (aclaración de la 005).
 */
export class ConfirmarRiesgo extends DecisionEvaluador {
  constructor(
    d: DependenciasDecisiones,
    private readonly catalogo: CatalogoEvaluacion,
  ) {
    super(d);
  }

  async ejecutar(
    decisor: Decisor & { readonly codigoReceta: string | null; readonly comentario: string | null },
  ): Promise<void> {
    const expediente = await this.leer(decisor, 'CONFIRMAR_RIESGO');
    const actual = await this.catalogo.obtener(expediente.codigoReceta);
    const destinoCodigo = decisor.codigoReceta ?? expediente.codigoReceta;
    const destino =
      destinoCodigo === expediente.codigoReceta
        ? actual
        : await this.catalogo.obtener(destinoCodigo);
    if (destino === null) {
      throw new ErrorValidacionSolicitud([
        { campo: 'codigoReceta', mensaje: 'La licencia no está vigente en el catálogo' },
      ]);
    }
    if (actual !== null && !mismoGrupo(actual.grupo, destino.grupo)) {
      throw new ErrorValidacionSolicitud([
        {
          campo: 'codigoReceta',
          mensaje: 'Solo se puede corregir a una licencia del mismo grupo',
        },
      ]);
    }
    const tasa = Number(destino.tasa);
    const nuevo = estadoTrasConfirmarRiesgo(tasa);
    const corrige = destino.codigo !== expediente.codigoReceta;
    const eventos: EventoParaPublicar[] = [
      eventoCambioEstado(expediente.numero, expediente.estado, nuevo),
    ];
    if (tasa > 0) {
      eventos.push({
        tipo: 'EsquelaSolicitada',
        datos: {
          numeroExpediente: expediente.numero,
          codigoReceta: destino.codigo,
          concepto: destino.nombre,
          monto: destino.tasa,
        },
      });
    }
    const comentario = tasa > 0 ? decisor.comentario : 'Sin pago: tasa 0.00';
    await this.guardar(
      {
        ...this.base(expediente, decisor, nuevo),
        comentario,
        auditoria: {
          accion: corrige ? 'CORREGIR_RIESGO' : 'CONFIRMAR_RIESGO',
          detalle: corrige
            ? { codigoRecetaAnterior: expediente.codigoReceta, codigoRecetaNueva: destino.codigo }
            : { codigoReceta: destino.codigo },
        },
        cambios: {
          codigoReceta: destino.codigo,
          ruta: destino.ruta,
          nivelRiesgoPropuesto: actual?.nivelRiesgo ?? null,
          nivelRiesgoConfirmado: destino.nivelRiesgo,
        },
        eventos,
      },
      'CONFIRMAR_RIESGO',
    );
  }
}

/** EN_EVALUACION → OBSERVADO, una sola vez (FR-007). */
export class ObservarExpediente extends DecisionEvaluador {
  async ejecutar(
    decisor: Decisor & { readonly descripcion: string; readonly plazoSubsanarEn: Date | null },
  ): Promise<void> {
    const descripcion = validarTextoDecision(decisor.descripcion, 'descripcion');
    const expediente = await this.leer(decisor, 'OBSERVAR');
    if (expediente.yaObservado) {
      throw new ErrorYaObservado();
    }
    const nuevo = siguienteEstado(expediente.estado, expediente.ruta, 'OBSERVAR');
    await this.guardar(
      {
        ...this.base(expediente, decisor, nuevo),
        comentario: 'Observado por el evaluador',
        auditoria: { accion: 'OBSERVAR', detalle: null },
        observacion: { descripcion, plazoSubsanarEn: decisor.plazoSubsanarEn },
        eventos: [eventoCambioEstado(expediente.numero, expediente.estado, nuevo)],
      },
      'OBSERVAR',
    );
  }
}

/** EN_EVALUACION → DENEGADO, con motivo (FR-008). El motivo queda en el historial. */
export class DenegarExpediente extends DecisionEvaluador {
  async ejecutar(decisor: Decisor & { readonly motivo: string }): Promise<void> {
    const motivo = validarTextoDecision(decisor.motivo, 'motivo');
    const expediente = await this.leer(decisor, 'DENEGAR');
    const nuevo = siguienteEstado(expediente.estado, expediente.ruta, 'DENEGAR');
    await this.guardar(
      {
        ...this.base(expediente, decisor, nuevo),
        comentario: motivo,
        auditoria: { accion: 'DENEGAR', detalle: null },
        eventos: [eventoCambioEstado(expediente.numero, expediente.estado, nuevo)],
      },
      'DENEGAR',
    );
  }
}

/**
 * PAGADO → APROBADO solo en las rutas A y C (historia 5 de la 005). La ruta B (inspección previa) y la
 * emisión de la licencia son de la 006. El comentario es opcional (hasta 1000 caracteres).
 */
export class AprobarExpediente extends DecisionEvaluador {
  async ejecutar(decisor: Decisor & { readonly comentario: string | null }): Promise<void> {
    const comentario = decisor.comentario?.trim() ?? '';
    if (comentario.length > 1000) {
      throw new ErrorValidacionSolicitud([
        { campo: 'comentario', mensaje: 'Debe tener como máximo 1000 caracteres' },
      ]);
    }
    const expediente = await this.leer(decisor, 'APROBAR');
    const nuevo = siguienteEstado(expediente.estado, expediente.ruta, 'APROBAR');
    await this.guardar(
      {
        ...this.base(expediente, decisor, nuevo),
        comentario: comentario === '' ? 'Expediente aprobado' : comentario,
        auditoria: { accion: 'APROBAR', detalle: null },
        eventos: [eventoCambioEstado(expediente.numero, expediente.estado, nuevo)],
      },
      'APROBAR',
    );
  }
}
