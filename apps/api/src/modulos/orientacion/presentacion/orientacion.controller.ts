import { Body, Controller, Header, HttpCode, Inject, Logger, Post, Req } from '@nestjs/common';
import type { components } from '@licencias/contracts';
import {
  CONFIGURACION,
  type Configuracion,
} from '../../../compartido/infraestructura/configuracion';
import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import { PROTECTOR_DATOS } from '../../../compartido/infraestructura/protector-datos-aes-gcm';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { ErrorLimitePreguntas, ResponderPregunta } from '../aplicacion/responder-pregunta';
import { ErrorPreguntaInvalida } from '../dominio/pregunta-orientacion';
import { ErrorLimitadorNoDisponible } from '../dominio/puertos';
import { leerPreguntaOrientacion } from './esquemas-orientacion';
import { huellaOrientacion } from './huella-orientacion';

type RespuestaOrientacion = components['schemas']['RespuestaOrientacion'];

/**
 * Chat de orientación (012): público, sin sesión. La pregunta va en el cuerpo y nunca se guarda ni
 * se registra (FR-015): el registro solo lleva cómo terminó, cuánto tardó y el modelo.
 */
@Controller('orientacion')
export class OrientacionController {
  private readonly registro = new Logger('Orientacion');

  constructor(
    private readonly responderPregunta: ResponderPregunta,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(PROTECTOR_DATOS) private readonly protector: ProtectorDatos,
  ) {}

  @Post('preguntas')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async preguntar(
    @Body() cuerpo: unknown,
    @Req() peticion: { readonly ip?: string },
  ): Promise<RespuestaOrientacion> {
    const { pregunta, historial } = leerPreguntaOrientacion(cuerpo);
    // Con `trust proxy` = TRUST_PROXY_SALTOS (002): nunca se lee X-Forwarded-For a mano. La IP no se
    // guarda ni se registra: solo su huella con sal (US5).
    const huella = huellaOrientacion(this.protector, peticion.ip ?? 'desconocido');

    let salida;
    try {
      salida = await this.responderPregunta.ejecutar({ pregunta, historial, huella });
    } catch (error) {
      if (error instanceof ErrorPreguntaInvalida) {
        throw new ErrorValidacion([{ campo: error.campo, mensaje: error.message }]);
      }
      if (error instanceof ErrorLimitePreguntas) {
        this.registro.log('Pregunta de orientación: desenlace=LIMITE');
        throw ErrorProblema.demasiadasPreguntas(error.segundosRestantes);
      }
      if (error instanceof ErrorLimitadorNoDisponible) {
        this.registro.warn('El límite de preguntas de orientación no se puede comprobar');
        throw ErrorProblema.orientacionNoDisponible();
      }
      throw error;
    }

    const { respuesta, desenlace, duracionMs } = salida;
    // US4: la clave inválida y la cuota agotada necesitan atención del equipo (nunca la clave).
    if (desenlace === 'CLAVE_INVALIDA' || desenlace === 'CUOTA_AGOTADA') {
      this.registro.warn(`El proveedor de orientación no está disponible: desenlace=${desenlace}`);
    }
    this.registro.log(
      `Pregunta de orientación: resultado=${respuesta.resultado} desenlace=${desenlace} ` +
        `duracionMs=${String(duracionMs)} modelo=${this.configuracion.orientacion.modelo} ` +
        `datoPersonalQuitado=${String(respuesta.datoPersonalQuitado)}`,
    );
    return {
      resultado: respuesta.resultado,
      texto: respuesta.texto,
      enlaces: respuesta.enlaces.map((enlace) => ({ ...enlace })),
      aclaracion: respuesta.aclaracion,
      datoPersonalQuitado: respuesta.datoPersonalQuitado,
    };
  }
}
