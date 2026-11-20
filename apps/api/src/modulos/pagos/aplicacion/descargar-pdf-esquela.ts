import { codigoEsquelaDe } from '../dominio/esquela';
import type { EstadoExpediente } from '../dominio/puertos/estado-expediente';
import type { PdfEsquela } from '../dominio/puertos/pdf-esquela';
import type { RepositorioEsquelas } from '../dominio/puertos/repositorio-esquelas';
import { ErrorEsquelaNoEncontrada } from './errores';

/** La esquela todavía se está generando (202): el riesgo se confirmó hace segundos. */
export class ErrorEsquelaEnGeneracion extends Error {
  constructor() {
    super('La esquela se está generando');
    this.name = 'ErrorEsquelaEnGeneracion';
  }
}

/** El `tokenConsulta` es de otro expediente (403). */
export class ErrorEsquelaDeOtroExpediente extends Error {
  constructor() {
    super('La esquela es de otro expediente');
    this.name = 'ErrorEsquelaDeOtroExpediente';
  }
}

/** Quién descarga: el administrado con su `tokenConsulta` (un solo expediente) o el personal. */
export type LectorEsquela =
  { readonly tipo: 'CONSULTA'; readonly numeroExpediente: string } | { readonly tipo: 'PERSONAL' };

/** `GET /esquelas/{codigo}/pdf` (FR-016 a FR-018 de la 005). */
export class DescargarPdfEsquela {
  constructor(
    private readonly d: {
      readonly esquelas: Pick<RepositorioEsquelas, 'obtener'>;
      readonly expedientes: EstadoExpediente;
      readonly pdf: PdfEsquela;
    },
  ) {}

  async ejecutar(entrada: {
    readonly codigo: string;
    readonly lector: LectorEsquela;
  }): Promise<{ readonly codigo: string; readonly contenido: Uint8Array }> {
    if (
      entrada.lector.tipo === 'CONSULTA' &&
      codigoEsquelaDe(entrada.lector.numeroExpediente) !== entrada.codigo
    ) {
      throw new ErrorEsquelaDeOtroExpediente();
    }
    const esquela = await this.d.esquelas.obtener(entrada.codigo);
    if (esquela === null) {
      // Si el expediente espera el pago, la esquela está en camino (cola de eventos, research §R-01).
      const numero = entrada.codigo.replace(/^ESQ-/, '');
      if ((await this.d.expedientes.estadoDe(numero)) === 'PENDIENTE_PAGO') {
        throw new ErrorEsquelaEnGeneracion();
      }
      throw new ErrorEsquelaNoEncontrada();
    }
    return { codigo: esquela.codigo, contenido: await this.d.pdf.generar(esquela.aDatos()) };
  }
}
