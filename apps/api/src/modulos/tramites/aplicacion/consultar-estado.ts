import { type EstadoExpediente, TEXTO_ESTADO_PUBLICO } from '../dominio/estado-publico';
import type { DatosPagoConsulta } from '../dominio/puertos/datos-pago-consulta';
import type { LimitadorConsultas } from '../dominio/puertos/limitador-consultas';
import type {
  ExpedienteConsultado,
  RepositorioExpedientes,
} from '../dominio/puertos/repositorio-expedientes';
import { NumeroExpediente } from '../dominio/numero-expediente';

/** Esquema `EstadoPublico` del contrato (sin datos personales). */
export interface EstadoPublico {
  readonly numero: string;
  readonly estado: EstadoExpediente;
  readonly descripcionEstado: string;
  readonly siguientePaso: string;
  readonly ruta: 'A' | 'B' | 'C';
  readonly nombreLicencia: string;
  readonly presentadoEn: Date;
  readonly vencePlazoEn: Date | null;
  readonly historial: readonly {
    readonly estado: EstadoExpediente;
    readonly descripcion: string;
    readonly ocurridoEn: Date;
  }[];
  readonly observacionesPendientes: readonly string[];
  /** Solo en OBSERVADO: a qué requisitos se pueden adjuntar documentos al subsanar. */
  readonly requisitosSubsanables: readonly { readonly id: number; readonly descripcion: string }[];
  readonly esquela: {
    readonly codigo: string;
    readonly monto: string;
    readonly pagada: boolean;
  } | null;
  /** Solo cuando el expediente está PENDIENTE_PAGO (research §R-08 de la 005). */
  readonly tokenConsulta: { readonly token: string; readonly expiraEn: number } | null;
}

export type ResultadoConsulta =
  | { readonly tipo: 'ENCONTRADO'; readonly estado: EstadoPublico }
  | { readonly tipo: 'NO_ENCONTRADO' }
  | { readonly tipo: 'BLOQUEADO'; readonly segundosRestantes: number };

const aEstadoPublico = (
  expediente: ExpedienteConsultado,
  pago: Pick<EstadoPublico, 'esquela' | 'tokenConsulta'>,
): EstadoPublico => {
  const texto = TEXTO_ESTADO_PUBLICO[expediente.estado];
  return {
    numero: expediente.numero,
    estado: expediente.estado,
    descripcionEstado: texto.descripcion,
    siguientePaso: texto.siguientePaso,
    ruta: expediente.ruta,
    nombreLicencia: expediente.nombreLicencia,
    presentadoEn: expediente.presentadoEn,
    vencePlazoEn: expediente.vencePlazoEn,
    historial: expediente.historial.map((registro) => ({
      estado: registro.estado,
      descripcion: TEXTO_ESTADO_PUBLICO[registro.estado].descripcion,
      ocurridoEn: registro.ocurridoEn,
    })),
    observacionesPendientes:
      expediente.estado === 'OBSERVADO' ? expediente.observacionesPendientes : [],
    requisitosSubsanables: expediente.estado === 'OBSERVADO' ? expediente.requisitos : [],
    ...pago,
  };
};

/** Estados en los que ya puede existir una esquela (después de confirmar el riesgo). */
const CON_ESQUELA: ReadonlySet<string> = new Set([
  'PENDIENTE_PAGO',
  'PAGADO',
  'EN_INSPECCION',
  'APROBADO',
  'LICENCIA_PROVISIONAL',
  'LICENCIA_EMITIDA',
]);

/**
 * Consulta pública del estado (CU05 de la 004, research §R-12). El formato ya llega revisado por la
 * presentación (un 422 no cuenta como intento). Si el limitador no responde, su error sube (503).
 */
export class ConsultarEstado {
  constructor(
    private readonly dependencias: {
      readonly expedientes: Pick<RepositorioExpedientes, 'buscarParaConsulta'>;
      readonly limitador: LimitadorConsultas;
      /** Opcional: sin él la consulta no trae datos de pago (004). */
      readonly pago?: DatosPagoConsulta;
    },
  ) {}

  async ejecutar(entrada: {
    readonly numeroExpediente: string;
    readonly documento: string;
    readonly origen: string;
  }): Promise<ResultadoConsulta> {
    const numero = NumeroExpediente.normalizar(entrada.numeroExpediente);
    const documento = entrada.documento.trim().toUpperCase();
    const { limitador, expedientes } = this.dependencias;

    const reserva = await limitador.reservar(entrada.origen);
    if (!reserva.permitido) {
      return { tipo: 'BLOQUEADO', segundosRestantes: reserva.segundosRestantes };
    }
    const expediente = await expedientes.buscarParaConsulta(numero, documento);
    if (expediente === null) {
      // El intento reservado queda contado como fallo.
      return { tipo: 'NO_ENCONTRADO' };
    }
    await limitador.liberar(entrada.origen);
    return {
      tipo: 'ENCONTRADO',
      estado: aEstadoPublico(expediente, await this.datosPago(expediente)),
    };
  }

  private async datosPago(
    expediente: ExpedienteConsultado,
  ): Promise<Pick<EstadoPublico, 'esquela' | 'tokenConsulta'>> {
    const { pago } = this.dependencias;
    if (pago === undefined || !CON_ESQUELA.has(expediente.estado)) {
      return { esquela: null, tokenConsulta: null };
    }
    const esperaPago = expediente.estado === 'PENDIENTE_PAGO';
    const [esquela, tokenConsulta] = await Promise.all([
      pago.esquelaDe(expediente.numero),
      esperaPago ? pago.tokenConsulta(expediente.numero) : Promise.resolve(null),
    ]);
    return { esquela, tokenConsulta };
  }
}
