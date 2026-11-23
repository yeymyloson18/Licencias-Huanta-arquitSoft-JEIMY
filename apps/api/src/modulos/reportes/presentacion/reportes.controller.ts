import { Controller, Get, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { RequiereRoles } from '../../seguridad/fachada';
import { fechaLima } from '../../../compartido/dominio/fecha-lima';
import { ObtenerTablero } from '../aplicacion/obtener-tablero';
import { ReporteLicencias } from '../aplicacion/reporte-licencias';
import { aCsv } from '../dominio/csv';
import { ErrorRangoInvalido } from '../dominio/rango-fechas';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

const esquemaTablero = z.object({
  desde: z.string('Debe ser una fecha AAAA-MM-DD').optional(),
  hasta: z.string('Debe ser una fecha AAAA-MM-DD').optional(),
});

const esquemaReporte = z.object({
  situacion: z.enum(
    ['VIGENTES', 'EN_TRAMITE', 'ITSE_POR_VENCER'],
    'Elige VIGENTES, EN_TRAMITE o ITSE_POR_VENCER',
  ),
  codigoReceta: z
    .string()
    .regex(/^(LIC-0[1-9]|TRF-01|CGI-01|DUP-01)$/, 'Código de licencia inválido')
    .optional(),
  giro: z.string().max(150, 'Hasta 150 caracteres').optional(),
  zona: z.string().max(150, 'Hasta 150 caracteres').optional(),
  formato: z.enum(['json', 'csv'], 'Elige json o csv').default('json'),
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
  constructor(
    private readonly tablero: ObtenerTablero,
    private readonly reporte: ReporteLicencias,
  ) {}

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

  @Get('licencias')
  @RequiereRoles('JEFATURA')
  async reporteLicencias(
    @Query() consulta: unknown,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const { formato, ...filtro } = validar(esquemaReporte, consulta);
    const resultado = await this.reporte.ejecutar(filtro);
    respuesta.setHeader('X-Reporte-Truncado', String(resultado.truncado));
    if (formato === 'json') {
      return resultado.filas;
    }
    const nombre = `reporte-${filtro.situacion.toLowerCase()}-${fechaLima(new Date())}.csv`;
    respuesta.setHeader('Content-Type', 'text/csv; charset=utf-8');
    respuesta.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    return aCsv(resultado.filas);
  }
}
