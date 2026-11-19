import { Body, Controller, Headers, Post, Res, UseGuards } from '@nestjs/common';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import {
  IdentidadActual,
  type IdentidadConfirmada,
  TokenIdentidadGuard,
} from '../../seguridad/fachada';
import { PresentarSolicitud, type PresentacionRegistrada } from '../aplicacion/presentar-solicitud';
import { esquemaNuevaSolicitud, validarConEsquema } from './esquemas-tramites';
import { traducirErrorTramites } from './traducir-errores';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
  status(codigo: number): unknown;
}

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Esquema `ExpedienteRegistrado` del contrato. */
const aRespuesta = (expediente: PresentacionRegistrada) => ({
  numero: expediente.numero,
  estado: expediente.estado,
  ruta: expediente.ruta,
  codigoReceta: expediente.codigoReceta,
  nombreLicencia: expediente.nombreLicencia,
  canal: expediente.canal,
  presentadoEn: expediente.presentadoEn.toISOString(),
  vencePlazoEn: expediente.vencePlazoEn,
  siguientePaso: expediente.siguientePaso,
});

/** Presentación de la solicitud (CU04, contracts/identidad-y-solicitud.md de la 004). */
@Controller('expedientes')
export class ExpedientesController {
  constructor(private readonly presentarSolicitud: PresentarSolicitud) {}

  @Post()
  @UseGuards(TokenIdentidadGuard)
  async presentar(
    @Body() cuerpo: unknown,
    @Headers('idempotency-key') claveIdempotencia: string | undefined,
    @IdentidadActual() identidad: IdentidadConfirmada,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    if (claveIdempotencia === undefined || !FORMATO_UUID.test(claveIdempotencia)) {
      throw new ErrorValidacion([
        { campo: 'Idempotency-Key', mensaje: 'Envía un UUID por cada intento de presentación' },
      ]);
    }
    const solicitud = validarConEsquema(esquemaNuevaSolicitud, cuerpo);

    try {
      const resultado = await this.presentarSolicitud.ejecutar({
        solicitud,
        claveIdempotencia: claveIdempotencia.toLowerCase(),
        canal: { tipo: 'EN_LINEA', verificacionId: identidad.verificacionId },
      });
      respuesta.status(resultado.tipo === 'CREADO' ? 201 : 200);
      respuesta.setHeader('Location', `/api/v1/expedientes/${resultado.expediente.numero}`);
      return aRespuesta(resultado.expediente);
    } catch (error) {
      throw traducirErrorTramites(error);
    }
  }
}
