import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { esFechaValida } from '../../../compartido/dominio/fecha-lima';
import { TAMANO_MAXIMO_BYTES } from '../../../compartido/dominio/tipo-archivo';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { RequiereRoles, UsuarioActual, type UsuarioAutenticado } from '../../seguridad/fachada';
import {
  AsignarInspector,
  ErrorInspeccionNoEncontrada,
  type InspeccionParaBandeja,
  ListarInspecciones,
  RegistrarResultado,
} from '../aplicacion/inspecciones';
import {
  type DatosInspeccion,
  ErrorDatoInspeccion,
  ErrorInspeccionYaRegistrada,
  ErrorNoEsInspectorAsignado,
  MAXIMO_FOTOS,
} from '../dominio/inspeccion';
import type { PersonalInspecciones } from '../dominio/puertos';
import { Inject } from '@nestjs/common';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

/** Lo que entrega Multer de un archivo en memoria. */
interface ArchivoRecibido {
  readonly buffer: Buffer;
}

export const PERSONAL_INSPECCIONES = Symbol('PERSONAL_INSPECCIONES');

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fecha = (campo: string) =>
  z.string('Debe ser un texto').refine(esFechaValida, `${campo}: debe ser una fecha AAAA-MM-DD`);

const esquemaAsignar = z.strictObject({
  inspectorId: z.uuid('No es un usuario válido'),
  programadaPara: fecha('programadaPara'),
});

const esquemaResultado = z.object({
  resultado: z.enum(['FAVORABLE', 'DESFAVORABLE'], 'Elige FAVORABLE o DESFAVORABLE'),
  observaciones: z.string().max(4000, 'Hasta 4000 caracteres').optional(),
  numeroCertificado: z.string().max(30, 'Hasta 30 caracteres').optional(),
  certificadoEmitidoEn: fecha('certificadoEmitidoEn').optional(),
});

const esquemaFiltro = z.object({
  estado: z.enum(['PENDIENTE', 'ASIGNADA', 'REALIZADA']).optional(),
  pagina: z.coerce.number().int().min(1).max(1_000_000).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
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

const leerId = (texto: string): string => {
  if (!FORMATO_UUID.test(texto)) {
    throw ErrorProblema.noEncontrado();
  }
  return texto;
};

/** Esquema `Inspeccion` del contrato. */
const aRespuesta = (inspeccion: DatosInspeccion | InspeccionParaBandeja) => ({
  id: inspeccion.id,
  numeroExpediente: inspeccion.numeroExpediente,
  tipo: inspeccion.tipo,
  estado: inspeccion.estado,
  inspectorId: inspeccion.inspectorId,
  programadaPara: inspeccion.programadaPara,
  resultado: inspeccion.resultado,
  observaciones: inspeccion.observaciones,
  numeroCertificado: inspeccion.numeroCertificado,
  certificadoEmitidoEn: inspeccion.certificadoEmitidoEn,
  registradaEn: inspeccion.registradaEn?.toISOString() ?? null,
  ...('giro' in inspeccion
    ? {
        giro: inspeccion.giro,
        nombreLicencia: inspeccion.nombreLicencia,
        nombreInspector: inspeccion.nombreInspector,
        ...(inspeccion.direccion === undefined ? {} : { direccion: inspeccion.direccion }),
      }
    : {}),
});

const traducir = (error: unknown): unknown => {
  if (error instanceof ErrorDatoInspeccion) {
    return new ErrorValidacion([{ campo: error.campo, mensaje: error.message }]);
  }
  if (error instanceof ErrorInspeccionNoEncontrada) {
    return ErrorProblema.noEncontrado();
  }
  if (error instanceof ErrorInspeccionYaRegistrada) {
    return ErrorProblema.inspeccionYaRegistrada();
  }
  if (error instanceof ErrorNoEsInspectorAsignado) {
    return ErrorProblema.sinPermiso();
  }
  return error;
};

/** Inspecciones ITSE (historia 2 de la 006). */
@Controller('inspecciones')
export class InspeccionesController {
  constructor(
    private readonly listarInspecciones: ListarInspecciones,
    private readonly asignarInspector: AsignarInspector,
    private readonly registrarResultado: RegistrarResultado,
    @Inject(PERSONAL_INSPECCIONES) private readonly personal: PersonalInspecciones,
  ) {}

  @Get()
  @RequiereRoles('JEFATURA', 'INSPECTOR')
  async listar(
    @Query() consulta: Record<string, string | undefined>,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const filtro = validar(esquemaFiltro, consulta);
    const pagina = await this.listarInspecciones.ejecutar({
      usuario: { id: usuario.usuarioId, esJefatura: usuario.roles.includes('JEFATURA') },
      estado: filtro.estado ?? null,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    });
    return { ...pagina, datos: pagina.datos.map(aRespuesta) };
  }

  @Get('inspectores')
  @RequiereRoles('JEFATURA')
  async inspectores(@Res({ passthrough: true }) respuesta: RespuestaHttp) {
    respuesta.setHeader('Cache-Control', 'no-store');
    return (await this.personal.inspectoresActivos()).map(({ id, nombre }) => ({ id, nombre }));
  }

  @Post(':inspeccionId/asignar')
  @HttpCode(200)
  @RequiereRoles('JEFATURA')
  async asignar(
    @Param('inspeccionId') id: string,
    @Body() cuerpo: unknown,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const datos = validar(esquemaAsignar, cuerpo);
    try {
      return aRespuesta(
        await this.asignarInspector.ejecutar({
          inspeccionId: leerId(id),
          inspectorId: datos.inspectorId,
          programadaPara: datos.programadaPara,
          usuarioId: usuario.usuarioId,
        }),
      );
    } catch (error) {
      throw traducir(error);
    }
  }

  /** Multer corta cada foto a los 10 MB (413) y acepta una de más para responder 422 con 6. */
  @Post(':inspeccionId/resultado')
  @HttpCode(201)
  @RequiereRoles('INSPECTOR')
  @UseInterceptors(
    FilesInterceptor('fotos', MAXIMO_FOTOS + 1, {
      limits: { fileSize: TAMANO_MAXIMO_BYTES, files: MAXIMO_FOTOS + 1 },
    }),
  )
  async resultado(
    @Param('inspeccionId') id: string,
    @Body() cuerpo: unknown,
    @UploadedFiles() fotos: ArchivoRecibido[] | undefined,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    const datos = validar(esquemaResultado, cuerpo);
    try {
      return aRespuesta(
        await this.registrarResultado.ejecutar({
          inspeccionId: leerId(id),
          inspectorId: usuario.usuarioId,
          resultado: datos.resultado,
          observaciones: datos.observaciones ?? null,
          numeroCertificado:
            datos.numeroCertificado === undefined || datos.numeroCertificado.trim() === ''
              ? null
              : datos.numeroCertificado,
          certificadoEmitidoEn: datos.certificadoEmitidoEn ?? null,
          fotos: (fotos ?? []).map((foto) => ({ contenido: new Uint8Array(foto.buffer) })),
        }),
      );
    } catch (error) {
      throw traducir(error);
    }
  }
}
