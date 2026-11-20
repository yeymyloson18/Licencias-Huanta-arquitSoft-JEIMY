import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { RequiereRoles, UsuarioActual, type UsuarioAutenticado } from '../../seguridad/fachada';
import {
  ErrorFeriadoNoEncontrado,
  ErrorFeriadoRepetido,
  GestionarFeriados,
} from '../aplicacion/feriados';
import { ErrorDatoFeriado } from '../dominio/feriado';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

const esquemaAnio = z.object({
  anio: z.coerce
    .number('Debe ser un año')
    .int('Debe ser un año')
    .min(2024, 'Debe ser un año entre 2024 y 2100')
    .max(2100, 'Debe ser un año entre 2024 y 2100'),
});

const esquemaFeriado = z.strictObject({
  fecha: z.string('Debe ser un texto'),
  descripcion: z.string('Debe ser un texto'),
  alcance: z.string('Debe ser un texto'),
});

const validar = <T extends z.ZodType>(esquema: T, valor: unknown): z.infer<T> => {
  const resultado = esquema.safeParse(valor ?? {});
  if (!resultado.success) {
    throw new ErrorValidacion(
      resultado.error.issues.map((problema) => ({
        campo: String(problema.path[0] ?? 'cuerpo'),
        mensaje: problema.message,
      })),
    );
  }
  return resultado.data;
};

const traducir = (error: unknown): unknown => {
  if (error instanceof ErrorDatoFeriado) {
    return new ErrorValidacion([{ campo: error.campo, mensaje: error.message }]);
  }
  if (error instanceof ErrorFeriadoRepetido) {
    return ErrorProblema.feriadoRepetido();
  }
  if (error instanceof ErrorFeriadoNoEncontrado) {
    return ErrorProblema.noEncontrado();
  }
  return error;
};

/** Feriados del año (historia 3 de la 006): cualquiera del personal los ve; el administrador los gestiona. */
@Controller('feriados')
export class FeriadosController {
  constructor(private readonly feriados: GestionarFeriados) {}

  @Get()
  @RequiereRoles('MESA_PARTES', 'EVALUADOR', 'INSPECTOR', 'CAJA', 'JEFATURA', 'ADMINISTRADOR')
  async listar(@Query() consulta: unknown) {
    return this.feriados.listar(validar(esquemaAnio, consulta).anio);
  }

  @Post()
  @HttpCode(201)
  @RequiereRoles('ADMINISTRADOR')
  async registrar(
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    try {
      return await this.feriados.registrar(validar(esquemaFeriado, cuerpo), usuario.usuarioId);
    } catch (error) {
      throw traducir(error);
    }
  }

  @Delete(':fecha')
  @HttpCode(204)
  @RequiereRoles('ADMINISTRADOR')
  async eliminar(@Param('fecha') fecha: string): Promise<void> {
    try {
      await this.feriados.eliminar(fecha);
    } catch (error) {
      throw traducir(error);
    }
  }
}
