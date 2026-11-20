import { ErrorEsquelaYaPagada } from '../dominio/errores';
import type { DatosEsquela } from '../dominio/esquela';
import { NumeroRecibo } from '../dominio/numero-recibo';
import type { EstadoExpediente } from '../dominio/puertos/estado-expediente';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioEsquelas } from '../dominio/puertos/repositorio-esquelas';
import {
  ErrorEsquelaNoEncontrada,
  ErrorExpedienteNoPendiente,
  ErrorReciboRepetido,
} from './errores';

// Caja (CU16 de la 005): consultar la esquela y registrar el pago una sola vez.

export interface EsquelaParaCaja extends DatosEsquela {
  /** `null` si el expediente ya no existe. */
  readonly estadoExpediente: string | null;
}

export interface DependenciasCaja {
  readonly esquelas: Pick<RepositorioEsquelas, 'obtener' | 'registrarPago'>;
  readonly expedientes: EstadoExpediente;
  readonly reloj: Reloj;
}

/** El código se acepta con espacios alrededor y en minúsculas. */
export const normalizarCodigoEsquela = (codigo: string): string => codigo.trim().toUpperCase();

/** `GET /esquelas/{codigo}`: los datos para confirmar antes de registrar (FR-020). */
export class ConsultarEsquela {
  constructor(private readonly d: Pick<DependenciasCaja, 'esquelas' | 'expedientes'>) {}

  async ejecutar(codigo: string): Promise<EsquelaParaCaja> {
    const esquela = await this.d.esquelas.obtener(normalizarCodigoEsquela(codigo));
    if (esquela === null) {
      throw new ErrorEsquelaNoEncontrada();
    }
    return {
      ...esquela.aDatos(),
      estadoExpediente: await this.d.expedientes.estadoDe(esquela.numeroExpediente),
    };
  }
}

/**
 * `POST /esquelas/{codigo}/pago` (FR-021 a FR-024): registra el recibo una sola vez, solo si el
 * expediente está PENDIENTE_PAGO. La base garantiza el pago único aun con pagos simultáneos.
 */
export class RegistrarPagoEnCaja {
  constructor(private readonly d: DependenciasCaja) {}

  async ejecutar(entrada: {
    readonly codigo: string;
    readonly numeroRecibo: string;
    readonly cajero: string;
  }): Promise<EsquelaParaCaja> {
    const recibo = NumeroRecibo.crear(entrada.numeroRecibo);
    const esquela = await this.d.esquelas.obtener(normalizarCodigoEsquela(entrada.codigo));
    if (esquela === null) {
      throw new ErrorEsquelaNoEncontrada();
    }
    if (esquela.pagada) {
      throw new ErrorEsquelaYaPagada();
    }
    const estado = await this.d.expedientes.estadoDe(esquela.numeroExpediente);
    if (estado !== 'PENDIENTE_PAGO') {
      throw new ErrorExpedienteNoPendiente(estado ?? 'INEXISTENTE');
    }
    const pagada = esquela.registrarPago(recibo, entrada.cajero, this.d.reloj.ahora());
    switch (await this.d.esquelas.registrarPago(pagada)) {
      case 'REGISTRADO':
        return { ...pagada.aDatos(), estadoExpediente: estado };
      case 'YA_PAGADA':
        throw new ErrorEsquelaYaPagada();
      case 'RECIBO_REPETIDO':
        throw new ErrorReciboRepetido();
    }
  }
}
