import { type EstadoExpediente, TEXTO_ESTADO_PUBLICO } from '../dominio/estado-publico';
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
}

export type ResultadoConsulta =
  | { readonly tipo: 'ENCONTRADO'; readonly estado: EstadoPublico }
  | { readonly tipo: 'NO_ENCONTRADO' }
  | { readonly tipo: 'BLOQUEADO'; readonly segundosRestantes: number };

const aEstadoPublico = (expediente: ExpedienteConsultado): EstadoPublico => {
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
  };
};

/**
 * Consulta pública del estado (CU05 de la 004, research §R-12). El formato ya llega revisado por la
 * presentación (un 422 no cuenta como intento). Si el limitador no responde, su error sube (503).
 */
export class ConsultarEstado {
  constructor(
    private readonly dependencias: {
      readonly expedientes: RepositorioExpedientes;
      readonly limitador: LimitadorConsultas;
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
    return { tipo: 'ENCONTRADO', estado: aEstadoPublico(expediente) };
  }
}
