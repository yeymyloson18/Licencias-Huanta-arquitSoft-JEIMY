import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { components } from '@licencias/contracts';
import { z } from 'zod';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { ObtenerPreguntas } from '../aplicacion/obtener-preguntas';
import { ProponerLicencia } from '../aplicacion/proponer-licencia';
import { ErrorRespuestasInvalidas } from '../dominio/motor-reglas-asistente';
import { mapearReceta } from './mapear-receta';

type PreguntaAsistente = components['schemas']['PreguntaAsistente'];
type ResultadoAsistente = components['schemas']['ResultadoAsistente'];

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

// contracts/openapi-cambios.md de la 003: preguntas cacheables 60 s; la propuesta no se guarda.
const CACHE_PUBLICA = 'public, max-age=60';
const SIN_CACHE = 'no-store';

const esquemaPropuesta = z.object({ respuestas: z.record(z.string(), z.string()) });

const leerRespuestas = (cuerpo: unknown): Record<string, string> => {
  const resultado = esquemaPropuesta.safeParse(cuerpo);
  if (!resultado.success) {
    throw new ErrorValidacion([
      {
        campo: 'respuestas',
        mensaje: 'Debe ser un objeto con el código de cada pregunta y su valor',
      },
    ]);
  }
  return resultado.data.respuestas;
};

/** Asistente de ruta: público, sin sesión ni datos personales (FR-001, FR-009, contracts/asistente.md). */
@Controller('asistente')
export class AsistenteController {
  constructor(
    private readonly obtenerPreguntas: ObtenerPreguntas,
    private readonly proponerLicencia: ProponerLicencia,
  ) {}

  @Get('preguntas')
  async preguntas(
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<PreguntaAsistente[]> {
    const preguntas = await this.obtenerPreguntas.ejecutar();

    respuesta.setHeader('Cache-Control', CACHE_PUBLICA);
    return preguntas.map((pregunta) => ({
      codigo: pregunta.codigo,
      orden: pregunta.orden,
      texto: pregunta.texto,
      opciones: pregunta.opciones.map((opcion) => ({ valor: opcion.valor, texto: opcion.texto })),
    }));
  }

  @Post('proponer')
  @HttpCode(200)
  async proponer(
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ): Promise<ResultadoAsistente> {
    respuesta.setHeader('Cache-Control', SIN_CACHE);

    let resultado;
    try {
      resultado = await this.proponerLicencia.ejecutar(leerRespuestas(cuerpo));
    } catch (error) {
      if (error instanceof ErrorRespuestasInvalidas) {
        throw new ErrorValidacion(
          error.errores.map((falla) => ({
            campo: `respuestas.${falla.pregunta}`,
            mensaje: falla.mensaje,
          })),
        );
      }
      throw error;
    }

    return resultado.tipo === 'PROPUESTA'
      ? { resultado: 'PROPUESTA', receta: mapearReceta(resultado.receta) }
      : { resultado: 'NO_DETERMINADA', motivo: resultado.motivo };
  }
}
