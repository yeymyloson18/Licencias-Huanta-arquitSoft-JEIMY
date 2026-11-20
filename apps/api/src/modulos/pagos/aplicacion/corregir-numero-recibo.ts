import { NumeroRecibo } from '../dominio/numero-recibo';
import type { EstadoExpediente } from '../dominio/puertos/estado-expediente';
import type { Reloj } from '../dominio/puertos/reloj';
import type { RepositorioEsquelas } from '../dominio/puertos/repositorio-esquelas';
import type { EsquelaParaCaja } from './caja';
import { normalizarCodigoEsquela } from './caja';
import { ErrorEsquelaNoEncontrada, ErrorReciboRepetido } from './errores';

/** Otra corrección cambió el recibo mientras tanto (409): se vuelve a leer. */
export class ErrorReciboCambiado extends Error {
  constructor() {
    super('El recibo cambió mientras se corregía');
    this.name = 'ErrorReciboCambiado';
  }
}

/**
 * `PATCH /esquelas/{codigo}/recibo` (RF24, historia 6 de la 005): la jefatura corrige un recibo mal
 * digitado, con motivo de 10 a 500 caracteres. No cambia el estado del pago ni del expediente.
 */
export class CorregirNumeroRecibo {
  constructor(
    private readonly d: {
      readonly esquelas: Pick<RepositorioEsquelas, 'obtener' | 'corregirRecibo'>;
      readonly expedientes: EstadoExpediente;
      readonly reloj: Reloj;
    },
  ) {}

  async ejecutar(entrada: {
    readonly codigo: string;
    readonly numeroRecibo: string;
    readonly motivo: string;
    readonly usuarioId: string;
  }): Promise<EsquelaParaCaja> {
    const recibo = NumeroRecibo.crear(entrada.numeroRecibo);
    const esquela = await this.d.esquelas.obtener(normalizarCodigoEsquela(entrada.codigo));
    if (esquela === null) {
      throw new ErrorEsquelaNoEncontrada();
    }
    // El dominio exige que esté pagada, el motivo y que el recibo sea distinto.
    const correccion = esquela.corregirRecibo(recibo, entrada.motivo);
    const resultado = await this.d.esquelas.corregirRecibo({
      esquela: correccion.esquela,
      reciboAnterior: correccion.reciboAnterior,
      motivo: correccion.motivo,
      usuarioId: entrada.usuarioId,
      en: this.d.reloj.ahora(),
    });
    if (resultado === 'RECIBO_REPETIDO') {
      throw new ErrorReciboRepetido();
    }
    if (resultado === 'CAMBIO') {
      throw new ErrorReciboCambiado();
    }
    return {
      ...correccion.esquela.aDatos(),
      estadoExpediente: await this.d.expedientes.estadoDe(esquela.numeroExpediente),
    };
  }
}
