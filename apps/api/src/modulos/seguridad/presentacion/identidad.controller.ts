import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { z } from 'zod';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import {
  ErrorAutenticacion,
  ErrorDatosInvalidos,
  ErrorDemasiadosIntentos,
  ErrorIdentidadNoCoincide,
  ErrorIdentificacionNoDisponible,
} from '../aplicacion/errores';
import { VerificarIdentidadAdministrado } from '../aplicacion/verificar-identidad-administrado';
import { VerificarOtpAdministrado } from '../aplicacion/verificar-otp-administrado';
import { ErrorEnvioOtp } from '../dominio/puertos/enviador-otp';
import { ErrorLimitadorNoDisponible } from '../dominio/puertos/limitador-intentos';
import { esquemaIdentidad, MENSAJES_IDENTIDAD } from './esquema-identidad';
import { validarCuerpo } from './validacion';

interface PeticionConIp {
  /** IP del cliente; con `trust proxy`, la que informa el nginx del portal (research §R-07). */
  readonly ip?: string;
}

interface RespuestaConCabeceras {
  setHeader(nombre: string, valor: string): unknown;
}

const ipDe = (peticion: PeticionConIp): string => peticion.ip ?? 'desconocida';

const esquemaCodigo = z.object({
  desafioId: z.uuid(),
  codigo: z.string().regex(/^[0-9]{6}$/),
});

const MENSAJES_CODIGO: Readonly<Record<string, string>> = {
  desafioId: 'El desafío no es válido',
  codigo: 'El código debe tener 6 dígitos',
};

/**
 * Identidad del administrado que presenta en línea (CU03, contracts/identidad-y-solicitud.md de la
 * 004). Público; ninguna respuesta se guarda en caché ni repite los datos enviados.
 */
@Controller('identidad')
export class IdentidadController {
  constructor(
    private readonly verificarIdentidad: VerificarIdentidadAdministrado,
    private readonly verificarOtp: VerificarOtpAdministrado,
  ) {}

  @Post('verificar')
  @HttpCode(200)
  async verificar(
    @Body() cuerpo: unknown,
    @Req() peticion: PeticionConIp,
    @Res({ passthrough: true }) respuesta: RespuestaConCabeceras,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const datos = validarCuerpo(esquemaIdentidad, cuerpo, MENSAJES_IDENTIDAD);
    try {
      const desafio = await this.verificarIdentidad.ejecutar({ ...datos, ip: ipDe(peticion) });
      return {
        desafioId: desafio.desafioId,
        venceEn: desafio.venceEn.toISOString(),
        celularEnmascarado: desafio.celularEnmascarado,
      };
    } catch (error) {
      throw traducirErrorIdentidad(error);
    }
  }

  @Post('verificar-otp')
  @HttpCode(200)
  async verificarCodigo(
    @Body() cuerpo: unknown,
    @Req() peticion: PeticionConIp,
    @Res({ passthrough: true }) respuesta: RespuestaConCabeceras,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const entrada = validarCuerpo(esquemaCodigo, cuerpo, MENSAJES_CODIGO);
    try {
      return await this.verificarOtp.ejecutar({ ...entrada, ip: ipDe(peticion) });
    } catch (error) {
      throw traducirErrorIdentidad(error);
    }
  }
}

/** Convierte los errores de identidad en problemas del contrato; nunca dice qué dato falló. */
export const traducirErrorIdentidad = (error: unknown): unknown => {
  if (error instanceof ErrorDatosInvalidos) {
    return new ErrorValidacion(
      error.campos.map((campo) => ({
        campo,
        mensaje: MENSAJES_IDENTIDAD[campo] ?? 'Valor no válido',
      })),
    );
  }
  if (error instanceof ErrorIdentidadNoCoincide) {
    return new ErrorValidacion([
      {
        campo: 'identidad',
        mensaje: 'Los datos no coinciden con el servicio de identificación',
      },
    ]);
  }
  if (error instanceof ErrorIdentificacionNoDisponible) {
    return ErrorProblema.identificacionNoDisponible();
  }
  if (error instanceof ErrorAutenticacion) {
    return ErrorProblema.noAutenticado();
  }
  if (error instanceof ErrorDemasiadosIntentos) {
    return ErrorProblema.demasiadosIntentos(error.segundos);
  }
  if (error instanceof ErrorEnvioOtp || error instanceof ErrorLimitadorNoDisponible) {
    return ErrorProblema.intentosNoDisponibles();
  }
  return error;
};
