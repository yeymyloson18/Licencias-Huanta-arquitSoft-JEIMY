import { type Fecha, fechaLima } from '../../../compartido/dominio/fecha-lima';
import { esCodigoVerificacion } from '../dominio/codigo-verificacion';
import type { DatosLicencia, EstadoItse, EstadoLicencia, Licencia } from '../dominio/licencia';
import type {
  LimitadorVerificaciones,
  PdfLicencia,
  Reloj,
  RepositorioLicencias,
} from '../dominio/puertos';
import { ErrorLicenciaDeOtroExpediente, ErrorLicenciaNoEncontrada } from './errores';

/** La licencia con su estado calculado al leer. */
export interface LicenciaLeida extends DatosLicencia {
  readonly estado: EstadoLicencia;
  readonly itseEstado: EstadoItse;
}

const leida = (licencia: Licencia, hoy: Fecha): LicenciaLeida => ({
  ...licencia.aDatos(),
  estado: licencia.estadoEn(hoy),
  itseEstado: licencia.itseEstadoEn(hoy),
});

/** Quién lee: el administrado con su `tokenConsulta` (un solo expediente) o el personal. */
export type LectorLicencia =
  { readonly tipo: 'CONSULTA'; readonly numeroExpediente: string } | { readonly tipo: 'PERSONAL' };

/** `GET /licencias/{numero}` y su PDF (FR-021 y FR-022 de la 006). */
export class ConsultarLicencia {
  constructor(
    private readonly d: {
      readonly licencias: Pick<RepositorioLicencias, 'porNumero'>;
      readonly pdf: PdfLicencia;
      readonly reloj: Reloj;
      /** Base de la URL pública del QR, por ejemplo `https://licencias.munihuanta.gob.pe`. */
      readonly urlPublicaPortal: string;
    },
  ) {}

  urlVerificacion(codigoVerificacion: string): string {
    return `${this.d.urlPublicaPortal.replace(/\/+$/, '')}/verificar/${codigoVerificacion}`;
  }

  async obtener(numero: string, lector: LectorLicencia): Promise<LicenciaLeida> {
    return leida(await this.leer(numero, lector), fechaLima(this.d.reloj.ahora()));
  }

  async pdf(numero: string, lector: LectorLicencia): Promise<Uint8Array> {
    const licencia = await this.leer(numero, lector);
    return this.d.pdf.generar(
      licencia.aDatos(),
      this.urlVerificacion(licencia.aDatos().codigoVerificacion),
    );
  }

  private async leer(numero: string, lector: LectorLicencia): Promise<Licencia> {
    const licencia = await this.d.licencias.porNumero(numero);
    if (licencia === null) {
      throw new ErrorLicenciaNoEncontrada();
    }
    if (lector.tipo === 'CONSULTA' && lector.numeroExpediente !== licencia.numeroExpediente) {
      throw new ErrorLicenciaDeOtroExpediente();
    }
    return licencia;
  }
}

export type ResultadoVerificacion =
  | { readonly tipo: 'ENCONTRADA'; readonly licencia: LicenciaLeida }
  | { readonly tipo: 'NO_ENCONTRADA' }
  | { readonly tipo: 'BLOQUEADO'; readonly segundosRestantes: number };

/**
 * Verificación pública del QR (FR-019 y FR-020, research §R-12): cada "no encontrada" cuenta para el
 * límite por origen; una verificación exitosa devuelve el intento. Si el límite no responde, su error
 * sube (503).
 */
export class VerificarLicencia {
  constructor(
    private readonly d: {
      readonly licencias: Pick<RepositorioLicencias, 'porCodigo'>;
      readonly limitador: LimitadorVerificaciones;
      readonly reloj: Reloj;
    },
  ) {}

  async ejecutar(entrada: {
    readonly codigo: string;
    readonly origen: string;
  }): Promise<ResultadoVerificacion> {
    const reserva = await this.d.limitador.reservar(entrada.origen);
    if (!reserva.permitido) {
      return { tipo: 'BLOQUEADO', segundosRestantes: reserva.segundosRestantes };
    }
    const licencia = esCodigoVerificacion(entrada.codigo)
      ? await this.d.licencias.porCodigo(entrada.codigo)
      : null;
    if (licencia === null) {
      return { tipo: 'NO_ENCONTRADA' };
    }
    await this.d.limitador.liberar(entrada.origen);
    return { tipo: 'ENCONTRADA', licencia: leida(licencia, fechaLima(this.d.reloj.ahora())) };
  }
}
