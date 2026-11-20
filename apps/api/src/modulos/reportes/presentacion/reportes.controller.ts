import { Controller, Get, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { RequiereRoles } from '../../seguridad/fachada';
import { ObtenerTablero } from '../aplicacion/obtener-tablero';
import { ErrorRangoInvalido } from '../dominio/rango-fechas';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

const esquemaTablero = z.object({
  desde: z.string('Debe ser una fecha AAAA-MM-DD').optional(),
  hasta: z.string('Debe ser una fecha AAAA-MM-DD').optional(),
});

/** Convierte los problemas de zod en el 422 del contrato (campo y mensaje). */
export const validar = <T extends z.ZodType>(esquema: T, valor: unknown): z.infer<T> => {
  const resultado = esquema.safeParse(valor ?? {});
  if (!resultado.success) {
    throw new ErrorValidacion(
      resultado.error.issues.map((problema) => ({
        campo: String(problema.path[0] ?? 'consulta'),
        mensaje: problema.message,
      })),
    );
  }
  return resultado.data;
};

/** Tablero y reportes de la jefatura (HU10, RF18 y RF19; historias 1 y 2 de la 007). */
@Controller('reportes')
export class ReportesController {
  constructor(private readonly tablero: ObtenerTablero) {}

  @Get('tablero')
  @RequiereRoles('JEFATURA')
  async obtenerTablero(
    @Query() consulta: unknown,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const entrada = validar(esquemaTablero, consulta);
    try {
      return await this.tablero.ejecutar(entrada);
    } catch (error) {
      if (error instanceof ErrorRangoInvalido) {
        throw new ErrorValidacion([{ campo: error.campo, mensaje: error.message }]);
      }
      throw error;
    }
  }
}
