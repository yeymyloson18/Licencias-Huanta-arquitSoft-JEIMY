import type { ErrorCampoSolicitud } from '../dominio/errores';
import { campoRequisito, type DocumentoAdjunto } from '../dominio/politica-requisitos';
import type {
  DocumentoTemporal,
  RepositorioDocumentosTemporales,
} from '../dominio/puertos/repositorio-documentos-temporales';
import type { Reloj } from '../dominio/puertos/reloj';

/**
 * Quién sube y adjunta: en línea, la verificación de identidad del token; en mesa de partes, el
 * usuario del personal (004 y subsanación de la 005).
 */
export type CanalEntrante =
  | { readonly tipo: 'EN_LINEA'; readonly verificacionId: string }
  | { readonly tipo: 'MESA_PARTES'; readonly usuarioId: string };

/** Un documento temporal vence a las 24 horas (FR-014 de la 004). */
const VIDA_DOCUMENTO_MS = 24 * 60 * 60 * 1000;

/**
 * Cada documento debe existir, ser de quien lo adjunta y tener menos de 24 horas. Un documento ajeno
 * se responde igual que uno inexistente: no se revela que existe.
 */
export const revisarDocumentosTemporales = async (
  d: { readonly documentos: RepositorioDocumentosTemporales; readonly reloj: Reloj },
  adjuntos: readonly DocumentoAdjunto[],
  canal: CanalEntrante,
): Promise<ErrorCampoSolicitud[]> => {
  if (adjuntos.length === 0) {
    return [];
  }
  const encontrados = await d.documentos.obtenerVarios(adjuntos.map((a) => a.documentoId));
  const porId = new Map<string, DocumentoTemporal>(encontrados.map((doc) => [doc.id, doc]));
  const ahora = d.reloj.ahora().getTime();
  const errores: ErrorCampoSolicitud[] = [];
  for (const adjunto of adjuntos) {
    const documento = porId.get(adjunto.documentoId);
    const esDelSolicitante =
      canal.tipo === 'EN_LINEA'
        ? documento?.verificacionId === canal.verificacionId
        : documento?.usuarioId === canal.usuarioId;
    if (documento === undefined || !esDelSolicitante) {
      errores.push({
        campo: campoRequisito(adjunto.requisitoId),
        mensaje: 'El documento no está disponible. Vuelve a subirlo',
      });
    } else if (ahora - documento.subidoEn.getTime() > VIDA_DOCUMENTO_MS) {
      errores.push({
        campo: campoRequisito(adjunto.requisitoId),
        mensaje: 'El documento venció (más de 24 horas). Vuelve a subirlo',
      });
    }
  }
  return errores;
};
