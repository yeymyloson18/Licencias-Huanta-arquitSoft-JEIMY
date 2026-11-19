import type { AlmacenArchivos } from '../dominio/puertos/almacen-archivos';
import type { CalculadorHuella } from '../dominio/puertos/calculador-huella';
import type { GeneradorIds } from '../dominio/puertos/generador-ids';
import type { RepositorioDocumentosTemporales } from '../dominio/puertos/repositorio-documentos-temporales';
import type { Reloj } from '../dominio/puertos/reloj';
import { detectarTipoArchivo, TAMANO_MAXIMO_BYTES } from '../dominio/tipo-archivo';
import { ErrorValidacionSolicitud } from '../dominio/errores';
import { ErrorArchivoDemasiadoGrande, ErrorTipoArchivoNoPermitido } from './errores';

export interface DependenciasSubirDocumento {
  readonly almacen: AlmacenArchivos;
  readonly documentos: RepositorioDocumentosTemporales;
  readonly huella: CalculadorHuella;
  readonly ids: GeneradorIds;
  readonly reloj: Reloj;
}

/** Quién sube el archivo: el administrado en línea (su verificación) o un usuario de mesa de partes. */
export type SubidoPor =
  | { readonly verificacionId: string; readonly usuarioId?: undefined }
  | { readonly usuarioId: string; readonly verificacionId?: undefined };

export interface DocumentoSubido {
  readonly documentoId: string;
  readonly sha256: string;
}

const LARGO_MAXIMO_NOMBRE = 255;

/** Nombre para mostrar al personal: sin rutas, sin caracteres de control y de 255 caracteres. */
export const limpiarNombreArchivo = (nombre: string): string => {
  const sinRuta = nombre.split(/[\\/]/).pop() ?? '';
  // Se descartan los caracteres de control (menores que el espacio y DEL).
  const visible = Array.from(sinRuta)
    .filter((caracter) => {
      const codigo = caracter.charCodeAt(0);
      return codigo >= 0x20 && codigo !== 0x7f;
    })
    .join('')
    .trim();
  return (visible === '' ? 'documento' : visible).slice(0, LARGO_MAXIMO_NOMBRE);
};

/**
 * Sube un documento antes de presentar (FR-013 de la 004): solo PDF, JPG o PNG de hasta 10 MB, con el
 * tipo comprobado por el contenido y su huella SHA-256. Queda como temporal: solo lo puede usar quien
 * lo subió y vence a las 24 horas (FR-014).
 */
export class SubirDocumento {
  constructor(private readonly d: DependenciasSubirDocumento) {}

  async ejecutar(entrada: {
    contenido: Uint8Array;
    nombreOriginal: string;
    subidoPor: SubidoPor;
  }): Promise<DocumentoSubido> {
    if (entrada.contenido.length === 0) {
      throw new ErrorValidacionSolicitud([{ campo: 'archivo', mensaje: 'El archivo está vacío' }]);
    }
    if (entrada.contenido.length > TAMANO_MAXIMO_BYTES) {
      throw new ErrorArchivoDemasiadoGrande();
    }
    const tipo = detectarTipoArchivo(entrada.contenido);
    if (tipo === null) {
      throw new ErrorTipoArchivoNoPermitido();
    }

    const id = this.d.ids.generarId();
    const claveAlmacen = this.d.ids.generarId();
    const sha256 = this.d.huella.sha256(entrada.contenido);
    await this.d.almacen.guardar(claveAlmacen, entrada.contenido);
    try {
      await this.d.documentos.crear({
        id,
        claveAlmacen,
        nombreOriginal: limpiarNombreArchivo(entrada.nombreOriginal),
        tipoMime: tipo,
        tamanoBytes: entrada.contenido.length,
        sha256,
        verificacionId: entrada.subidoPor.verificacionId ?? null,
        usuarioId: entrada.subidoPor.usuarioId ?? null,
        subidoEn: this.d.reloj.ahora(),
      });
    } catch (error) {
      // Sin fila no hay forma de usarlo: el archivo no debe quedar huérfano.
      await this.d.almacen.borrar(claveAlmacen).catch(() => undefined);
      throw error;
    }
    return { documentoId: id, sha256 };
  }
}
