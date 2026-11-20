import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import {
  ConsultaOPersonalGuard,
  LectorActual,
  type LectorConsulta,
  RequiereRoles,
  Roles,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../../seguridad/fachada';
import {
  DescargarPdfEsquela,
  ErrorEsquelaDeOtroExpediente,
  ErrorEsquelaEnGeneracion,
} from '../aplicacion/descargar-pdf-esquela';
import {
  ConsultarEsquela,
  type EsquelaParaCaja,
  normalizarCodigoEsquela,
  RegistrarPagoEnCaja,
} from '../aplicacion/caja';
import { traducirErrorPagos } from './traducir-errores';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

const PATRON_CODIGO = /^ESQ-EXP-[0-9]{4}-[0-9]{6}$/;

/** Un código con formato inválido no puede existir: 404. */
export const leerCodigo = (texto: string): string => {
  const codigo = normalizarCodigoEsquela(texto);
  if (!PATRON_CODIGO.test(codigo)) {
    throw ErrorProblema.noEncontrado();
  }
  return codigo;
};

/** Esquema `Esquela` del contrato. */
export const aRespuestaEsquela = (esquela: EsquelaParaCaja) => ({
  codigo: esquela.codigo,
  numeroExpediente: esquela.numeroExpediente,
  concepto: esquela.concepto,
  nombreLicencia: esquela.concepto,
  monto: esquela.monto,
  pagada: esquela.pago !== null,
  numeroRecibo: esquela.pago?.numeroRecibo ?? null,
  pagadaEn: esquela.pago?.pagadaEn.toISOString() ?? null,
  generadaEn: esquela.generadaEn.toISOString(),
  ...(esquela.estadoExpediente === null ? {} : { estadoExpediente: esquela.estadoExpediente }),
});

const esquemaPago = z.strictObject({ numeroRecibo: z.string('Debe ser un texto') });

/** Caja (CU16 de la 005, contracts/openapi-cambios.md): consultar la esquela y registrar el pago. */
@Controller('esquelas')
export class EsquelasController {
  constructor(
    private readonly consultarEsquela: ConsultarEsquela,
    private readonly registrarPago: RegistrarPagoEnCaja,
    private readonly descargarPdf: DescargarPdfEsquela,
  ) {}

  /**
   * PDF de la esquela (FR-016 a FR-018): con el `tokenConsulta` del mismo expediente o una sesión
   * EVALUADOR, CAJA o JEFATURA. 202 mientras la esquela se genera.
   */
  @Get(':codigoEsquela/pdf')
  @UseGuards(ConsultaOPersonalGuard)
  @Roles('EVALUADOR', 'CAJA', 'JEFATURA')
  async pdf(
    @Param('codigoEsquela') codigo: string,
    @LectorActual() lector: LectorConsulta,
    @Res({ passthrough: true }) respuesta: RespuestaHttp & { status(codigo: number): unknown },
  ): Promise<StreamableFile | undefined> {
    respuesta.setHeader('Cache-Control', 'no-store');
    try {
      const { codigo: archivo, contenido } = await this.descargarPdf.ejecutar({
        codigo: leerCodigo(codigo),
        lector:
          lector.tipo === 'CONSULTA'
            ? { tipo: 'CONSULTA', numeroExpediente: lector.numeroExpediente }
            : { tipo: 'PERSONAL' },
      });
      respuesta.setHeader('X-Content-Type-Options', 'nosniff');
      return new StreamableFile(Buffer.from(contenido), {
        type: 'application/pdf',
        disposition: `attachment; filename="${archivo}.pdf"`,
        length: contenido.length,
      });
    } catch (error) {
      if (error instanceof ErrorEsquelaEnGeneracion) {
        respuesta.setHeader('Retry-After', '3');
        respuesta.status(202);
        return undefined;
      }
      if (error instanceof ErrorEsquelaDeOtroExpediente) {
        throw ErrorProblema.sinPermiso();
      }
      throw traducirErrorPagos(error);
    }
  }

  @Get(':codigoEsquela')
  @RequiereRoles('CAJA')
  async consultar(
    @Param('codigoEsquela') codigo: string,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    try {
      return aRespuestaEsquela(await this.consultarEsquela.ejecutar(leerCodigo(codigo)));
    } catch (error) {
      throw traducirErrorPagos(error);
    }
  }

  @Post(':codigoEsquela/pago')
  @HttpCode(201)
  @RequiereRoles('CAJA')
  async pagar(
    @Param('codigoEsquela') codigo: string,
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const datos = esquemaPago.safeParse(cuerpo ?? {});
    if (!datos.success) {
      throw new ErrorValidacion([
        { campo: 'numeroRecibo', mensaje: 'Escribe el número de recibo' },
      ]);
    }
    try {
      return aRespuestaEsquela(
        await this.registrarPago.ejecutar({
          codigo: leerCodigo(codigo),
          numeroRecibo: datos.data.numeroRecibo,
          cajero: usuario.usuarioId,
        }),
      );
    } catch (error) {
      throw traducirErrorPagos(error);
    }
  }
}
