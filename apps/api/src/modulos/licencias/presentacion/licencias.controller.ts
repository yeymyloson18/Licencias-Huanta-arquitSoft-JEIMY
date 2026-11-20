import { Controller, Get, Param, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import {
  ConsultaOPersonalGuard,
  LectorActual,
  type LectorConsulta,
  Roles,
} from '../../seguridad/fachada';
import {
  ConsultarLicencia,
  type LectorLicencia,
  type LicenciaLeida,
  VerificarLicencia,
} from '../aplicacion/consultar-licencia';
import { ErrorLicenciaDeOtroExpediente, ErrorLicenciaNoEncontrada } from '../aplicacion/errores';
import { ErrorLimitadorNoDisponible } from '../dominio/puertos';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

interface PeticionConIp {
  /** Con `trust proxy` = `TRUST_PROXY_SALTOS` (002): nunca se lee `X-Forwarded-For` a mano. */
  readonly ip?: string;
}

const PATRON_NUMERO = /^LF-[0-9]{4}-[0-9]{6}$/;

/** Esquema `LicenciaPublica` (ADR-007): solo los datos mínimos. */
export const aLicenciaPublica = (licencia: LicenciaLeida) => ({
  numero: licencia.numero,
  tipo: licencia.tipo,
  estado: licencia.estado,
  titular: licencia.titularPublico,
  nombreComercial: licencia.nombreComercial,
  giro: licencia.giro,
  zona: licencia.zona,
  emitidaEn: licencia.emitidaEn.toISOString().slice(0, 10),
  vigenteHasta: licencia.vigenteHasta,
  itseVenceEn: licencia.certificado?.venceEn ?? null,
  itseEstado: licencia.itseEstado,
});

const aLector = (lector: LectorConsulta): LectorLicencia =>
  lector.tipo === 'CONSULTA'
    ? { tipo: 'CONSULTA', numeroExpediente: lector.numeroExpediente }
    : { tipo: 'PERSONAL' };

const traducir = (error: unknown): unknown => {
  if (error instanceof ErrorLicenciaNoEncontrada) {
    return ErrorProblema.noEncontrado();
  }
  if (error instanceof ErrorLicenciaDeOtroExpediente) {
    return ErrorProblema.sinPermiso();
  }
  if (error instanceof ErrorLimitadorNoDisponible) {
    return ErrorProblema.intentosNoDisponibles();
  }
  return error;
};

const leerNumero = (texto: string): string => {
  const numero = texto.trim().toUpperCase();
  if (!PATRON_NUMERO.test(numero)) {
    throw ErrorProblema.noEncontrado();
  }
  return numero;
};

/** Licencias con QR (historia 1 de la 006): verificación pública, detalle y PDF. */
@Controller('licencias')
export class LicenciasController {
  constructor(
    private readonly verificarLicencia: VerificarLicencia,
    private readonly consultarLicencia: ConsultarLicencia,
  ) {}

  /** Pública, sin cuenta (FR-019 y FR-020). */
  @Get('verificar/:codigo')
  async verificar(
    @Param('codigo') codigo: string,
    @Req() peticion: PeticionConIp,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    let resultado;
    try {
      resultado = await this.verificarLicencia.ejecutar({
        codigo,
        origen: peticion.ip ?? 'desconocido',
      });
    } catch (error) {
      throw traducir(error);
    }
    switch (resultado.tipo) {
      case 'ENCONTRADA':
        return aLicenciaPublica(resultado.licencia);
      case 'NO_ENCONTRADA':
        throw ErrorProblema.noEncontrado();
      case 'BLOQUEADO':
        throw ErrorProblema.demasiadosIntentos(resultado.segundosRestantes);
    }
  }

  @Get(':numeroLicencia')
  @UseGuards(ConsultaOPersonalGuard)
  @Roles('MESA_PARTES', 'EVALUADOR', 'JEFATURA')
  async obtener(
    @Param('numeroLicencia') numero: string,
    @LectorActual() lector: LectorConsulta,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    try {
      const licencia = await this.consultarLicencia.obtener(leerNumero(numero), aLector(lector));
      return {
        ...aLicenciaPublica(licencia),
        numeroExpediente: licencia.numeroExpediente,
        codigoReceta: licencia.codigoReceta,
        urlVerificacion: this.consultarLicencia.urlVerificacion(licencia.codigoVerificacion),
        certificadoItse: licencia.certificado,
      };
    } catch (error) {
      throw traducir(error);
    }
  }

  @Get(':numeroLicencia/pdf')
  @UseGuards(ConsultaOPersonalGuard)
  @Roles('MESA_PARTES', 'EVALUADOR', 'JEFATURA')
  async pdf(
    @Param('numeroLicencia') numero: string,
    @LectorActual() lector: LectorConsulta,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<StreamableFile> {
    respuesta.setHeader('Cache-Control', 'no-store');
    try {
      const archivo = leerNumero(numero);
      const contenido = await this.consultarLicencia.pdf(archivo, aLector(lector));
      respuesta.setHeader('X-Content-Type-Options', 'nosniff');
      return new StreamableFile(Buffer.from(contenido), {
        type: 'application/pdf',
        disposition: `attachment; filename="${archivo}.pdf"`,
        length: contenido.length,
      });
    } catch (error) {
      throw traducir(error);
    }
  }
}
