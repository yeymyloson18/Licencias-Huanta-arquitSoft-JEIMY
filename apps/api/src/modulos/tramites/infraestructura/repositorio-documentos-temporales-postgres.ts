import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type {
  DocumentoTemporal,
  RepositorioDocumentosTemporales,
} from '../dominio/puertos/repositorio-documentos-temporales';
import { detectarTipoMimeGuardado, esUuid } from './comun-postgres';

/** Adaptador de `tramites.documento_temporal` (FR-013, FR-014 de la 004). */
export class RepositorioDocumentosTemporalesPostgres implements RepositorioDocumentosTemporales {
  constructor(private readonly prisma: PrismaServicio) {}

  async crear(documento: DocumentoTemporal): Promise<void> {
    await this.prisma.documento_temporal.create({
      data: {
        id: documento.id,
        clave_almacen: documento.claveAlmacen,
        nombre_original: documento.nombreOriginal,
        tipo_mime: documento.tipoMime,
        tamano_bytes: documento.tamanoBytes,
        sha256: documento.sha256,
        verificacion_id: documento.verificacionId,
        usuario_id: documento.usuarioId,
        subido_en: documento.subidoEn,
      },
    });
  }

  async obtenerVarios(ids: readonly string[]): Promise<DocumentoTemporal[]> {
    const validos = ids.filter(esUuid);
    if (validos.length === 0) {
      return [];
    }
    const filas = await this.prisma.documento_temporal.findMany({
      where: { id: { in: validos } },
    });
    return filas.map((fila) => ({
      id: fila.id,
      claveAlmacen: fila.clave_almacen,
      nombreOriginal: fila.nombre_original,
      tipoMime: detectarTipoMimeGuardado(fila.tipo_mime),
      tamanoBytes: fila.tamano_bytes,
      sha256: fila.sha256,
      verificacionId: fila.verificacion_id,
      usuarioId: fila.usuario_id,
      subidoEn: fila.subido_en,
    }));
  }
}
