import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { CambiarClave } from '../aplicacion/cambiar-clave';
import { CerrarSesion } from '../aplicacion/cerrar-sesion';
import type { SesionEmitida } from '../aplicacion/emitir-sesion';
import { ErrorAutenticacion, ErrorClaveInvalida } from '../aplicacion/errores';
import { IniciarSesion } from '../aplicacion/iniciar-sesion';
import { RenovarSesion } from '../aplicacion/renovar-sesion';
import { VerificarOtp } from '../aplicacion/verificar-otp';
import { PoliticaClave } from '../dominio/politica-clave';
import { ErrorEnvioOtp } from '../dominio/puertos/enviador-otp';
import { PermitirConClaveTemporal } from './decoradores';
import { JwtAuthGuard, type PeticionAutenticada } from './jwt-auth.guard';
import { aSesionPersonal, type SesionPersonalRespuesta } from './respuestas';
import { validarCuerpo } from './validacion';

const COOKIE_REFRESH = 'refresh_personal';
const RUTA_COOKIE = '/api/v1/auth';

const opcionesCookie = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: RUTA_COOKIE,
} as const;

/** Lo que este controlador necesita de la respuesta de Express. */
interface RespuestaConCookies {
  cookie(nombre: string, valor: string, opciones: Record<string, unknown>): unknown;
  clearCookie(nombre: string, opciones: Record<string, unknown>): unknown;
}

interface PeticionConCookies extends PeticionAutenticada {
  readonly cookies?: Readonly<Record<string, string | undefined>>;
}

const esquemaCredenciales = z.object({
  correo: z.email(),
  clave: z.string().min(1).max(128),
});
const esquemaVerificacion = z.object({
  desafioId: z.uuid(),
  codigo: z.string().regex(/^[0-9]{6}$/),
});
const esquemaCambioClave = z.object({
  claveActual: z.string().min(1).max(128),
  claveNueva: z.string(),
});

const MENSAJES: Readonly<Record<string, string>> = {
  correo: 'Debe ser un correo válido',
  clave: 'La clave es obligatoria',
  desafioId: 'El desafío no es válido',
  codigo: 'El código debe tener 6 dígitos',
  claveActual: 'La clave actual es obligatoria',
  claveNueva: 'La clave nueva es obligatoria',
};

/**
 * Inicio de sesión del personal (contracts/autenticacion.md). El refresh token viaja solo en la
 * cookie `refresh_personal` (HttpOnly, Secure, SameSite=Strict, Path=/api/v1/auth).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly iniciarSesion: IniciarSesion,
    private readonly verificarOtp: VerificarOtp,
    private readonly renovarSesion: RenovarSesion,
    private readonly cerrarSesion: CerrarSesion,
    private readonly cambiarClave: CambiarClave,
  ) {}

  @Post('iniciar-sesion')
  @HttpCode(200)
  async iniciar(@Body() cuerpo: unknown) {
    const entrada = validarCuerpo(esquemaCredenciales, cuerpo, MENSAJES);
    try {
      const desafio = await this.iniciarSesion.ejecutar(entrada);
      return {
        desafioId: desafio.desafioId,
        venceEn: desafio.venceEn.toISOString(),
        celularEnmascarado: desafio.celularEnmascarado,
      };
    } catch (error) {
      throw traducirError(error);
    }
  }

  @Post('verificar-otp')
  @HttpCode(200)
  async verificar(
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) respuesta: RespuestaConCookies,
  ): Promise<SesionPersonalRespuesta> {
    const entrada = validarCuerpo(esquemaVerificacion, cuerpo, MENSAJES);
    try {
      return this.responderSesion(await this.verificarOtp.ejecutar(entrada), respuesta);
    } catch (error) {
      throw traducirError(error);
    }
  }

  @Post('renovar')
  @HttpCode(200)
  async renovar(
    @Req() peticion: PeticionConCookies,
    @Res({ passthrough: true }) respuesta: RespuestaConCookies,
  ): Promise<SesionPersonalRespuesta> {
    try {
      const sesion = await this.renovarSesion.ejecutar({
        refreshToken: peticion.cookies?.[COOKIE_REFRESH] ?? '',
      });
      return this.responderSesion(sesion, respuesta);
    } catch (error) {
      if (error instanceof ErrorAutenticacion) {
        respuesta.clearCookie(COOKIE_REFRESH, opcionesCookie);
      }
      throw traducirError(error);
    }
  }

  @Post('cerrar-sesion')
  @HttpCode(204)
  async cerrar(
    @Req() peticion: PeticionConCookies,
    @Res({ passthrough: true }) respuesta: RespuestaConCookies,
  ): Promise<void> {
    await this.cerrarSesion.ejecutar({ refreshToken: peticion.cookies?.[COOKIE_REFRESH] });
    respuesta.clearCookie(COOKIE_REFRESH, opcionesCookie);
  }

  @Post('cambiar-clave')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @PermitirConClaveTemporal()
  async cambiar(
    @Body() cuerpo: unknown,
    @Req() peticion: PeticionConCookies,
    @Res({ passthrough: true }) respuesta: RespuestaConCookies,
  ): Promise<SesionPersonalRespuesta> {
    const entrada = validarCuerpo(esquemaCambioClave, cuerpo, MENSAJES);
    const usuario = peticion.usuarioAutenticado;
    if (usuario === undefined) {
      throw ErrorProblema.noAutenticado();
    }
    try {
      const sesion = await this.cambiarClave.ejecutar({
        usuarioId: usuario.usuarioId,
        sesionId: usuario.sesionId,
        ...entrada,
      });
      return this.responderSesion(sesion, respuesta);
    } catch (error) {
      throw traducirError(error);
    }
  }

  private responderSesion(
    sesion: SesionEmitida,
    respuesta: RespuestaConCookies,
  ): SesionPersonalRespuesta {
    const msRestantes = Math.max(0, sesion.venceMaximoEn.getTime() - Date.now());
    respuesta.cookie(COOKIE_REFRESH, sesion.refreshToken, {
      ...opcionesCookie,
      maxAge: msRestantes,
    });
    return aSesionPersonal(sesion);
  }
}

/** Convierte los errores de aplicación en problemas HTTP del contrato. */
const traducirError = (error: unknown): unknown => {
  if (error instanceof ErrorAutenticacion) {
    return ErrorProblema.noAutenticado();
  }
  if (error instanceof ErrorClaveInvalida) {
    return new ErrorValidacion(
      error.reglas.map((regla) => ({
        campo: 'claveNueva',
        mensaje: PoliticaClave.describir(regla),
      })),
    );
  }
  if (error instanceof ErrorEnvioOtp) {
    return ErrorProblema.servicioNoDisponible();
  }
  return error;
};
