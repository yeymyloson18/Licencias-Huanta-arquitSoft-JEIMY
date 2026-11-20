import { Controller, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';
import { type Solicitante, SolicitanteActual, SolicitanteGuard } from '../../seguridad/fachada';
import { SubirDocumento } from '../aplicacion/subir-documento';
import { TAMANO_MAXIMO_BYTES } from '../../../compartido/dominio/tipo-archivo';
import { traducirErrorTramites } from './traducir-errores';

interface RespuestaHttp {
  setHeader(nombre: string, valor: string): unknown;
}

/** Lo que entrega Multer de un archivo en memoria. */
interface ArchivoRecibido {
  readonly originalname: string;
  readonly buffer: Buffer;
}

/**
 * Subida de documentos antes de presentar (FR-013 de la 004, contracts/identidad-y-solicitud.md).
 * Acepta el token de identidad (en línea) o la sesión de MESA_PARTES (presencial). El guard corre
 * antes que Multer: sin autorización no se lee el archivo. Multer corta a los 10 MB (413).
 */
@Controller('documentos')
export class DocumentosController {
  constructor(private readonly subirDocumento: SubirDocumento) {}

  @Post()
  @UseGuards(SolicitanteGuard)
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_BYTES, files: 1 } }),
  )
  async subir(
    @UploadedFile() archivo: ArchivoRecibido | undefined,
    @SolicitanteActual() solicitante: Solicitante,
    @Res({ passthrough: true }) respuesta: RespuestaHttp,
  ) {
    respuesta.setHeader('Cache-Control', 'no-store');
    if (archivo === undefined) {
      throw new ErrorValidacion([{ campo: 'archivo', mensaje: 'Adjunta un archivo' }]);
    }
    try {
      return await this.subirDocumento.ejecutar({
        contenido: new Uint8Array(archivo.buffer),
        // Multer entrega el nombre en latin1; se recupera el UTF-8 original.
        nombreOriginal: Buffer.from(archivo.originalname, 'latin1').toString('utf8'),
        subidoPor:
          solicitante.canal === 'EN_LINEA'
            ? { verificacionId: solicitante.verificacionId }
            : { usuarioId: solicitante.usuarioId },
      });
    } catch (error) {
      throw traducirErrorTramites(error);
    }
  }
}
