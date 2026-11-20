import type { TipoArchivo } from '../../../../compartido/dominio/tipo-archivo';

/** Archivo subido antes de presentar (FR-013); solo lo usa quien lo subió y vence a las 24 h. */
export interface DocumentoTemporal {
  readonly id: string;
  readonly claveAlmacen: string;
  readonly nombreOriginal: string;
  readonly tipoMime: TipoArchivo;
  readonly tamanoBytes: number;
  readonly sha256: string;
  readonly verificacionId: string | null;
  readonly usuarioId: string | null;
  readonly subidoEn: Date;
}

/** Puerto: `tramites.documento_temporal`. */
export interface RepositorioDocumentosTemporales {
  crear(documento: DocumentoTemporal): Promise<void>;
  /** Los que existan de esa lista (los ids mal formados se ignoran). */
  obtenerVarios(ids: readonly string[]): Promise<DocumentoTemporal[]>;
  /** Los subidos antes de `antesDe`, del más antiguo al más nuevo, hasta `limite`. */
  listarVencidos(
    antesDe: Date,
    limite: number,
  ): Promise<{ readonly id: string; readonly claveAlmacen: string }[]>;
  borrar(ids: readonly string[]): Promise<void>;
}
