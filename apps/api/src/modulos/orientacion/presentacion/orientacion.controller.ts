import { Body, Controller, Header, HttpCode, Inject, Logger, Post } from '@nestjs/common';
import type { components } from '@licencias/contracts';
import {
  CONFIGURACION,
  type Configuracion,
} from '../../../compartido/infraestructura/configuracion';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { ResponderPregunta } from '../aplicacion/responder-pregunta';
import { ErrorPreguntaInvalida } from '../dominio/pregunta-orientacion';
import { leerPreguntaOrientacion } from './esquemas-orientacion';

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
  ) {}

  @Post('preguntas')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async preguntar(@Body() cuerpo: unknown): Promise<RespuestaOrientacion> {
    const { pregunta, historial } = leerPreguntaOrientacion(cuerpo);

    let salida;
    try {
      salida = await this.responderPregunta.ejecutar({ pregunta, historial });
    } catch (error) {
      if (error instanceof ErrorPreguntaInvalida) {
        throw new ErrorValidacion([{ campo: error.campo, mensaje: error.message }]);
      }
      throw error;
    }

    const { respuesta, desenlace, duracionMs } = salida;
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
