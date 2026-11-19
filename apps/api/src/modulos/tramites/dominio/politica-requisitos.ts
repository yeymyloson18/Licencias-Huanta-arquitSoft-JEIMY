import type { ErrorCampoSolicitud } from './errores';
import type { RequisitoAlPresentar } from './receta-al-presentar';

// Qué documentos pide la licencia elegida (FR-010 a FR-012 de la 004, research §R-11):
// - `SIEMPRE` → obligatorio (si el catálogo lo marca obligatorio; si no, opcional);
// - `CON_REPRESENTANTE` → obligatorio si actúa un representante; si no, no aplica;
// - `GIRO_ESPECIAL` y `SIN_PLANOS_VIGENTES` → opcional, con su explicación (aclaración 3).

export type ClaseRequisito = 'OBLIGATORIO' | 'OPCIONAL' | 'NO_APLICA';

export interface RequisitoClasificado {
  readonly requisito: RequisitoAlPresentar;
  readonly clase: ClaseRequisito;
}

export interface DocumentoAdjunto {
  readonly requisitoId: number;
  readonly documentoId: string;
}

const claseDe = (requisito: RequisitoAlPresentar, conRepresentante: boolean): ClaseRequisito => {
  switch (requisito.condicion) {
    case 'CON_REPRESENTANTE':
      return conRepresentante ? 'OBLIGATORIO' : 'NO_APLICA';
    case 'GIRO_ESPECIAL':
    case 'SIN_PLANOS_VIGENTES':
      return 'OPCIONAL';
    case 'SIEMPRE':
      return requisito.obligatorio ? 'OBLIGATORIO' : 'OPCIONAL';
  }
};

/** Clasifica los requisitos de la receta en el orden del catálogo. */
export const clasificarRequisitos = (
  requisitos: readonly RequisitoAlPresentar[],
  conRepresentante: boolean,
): RequisitoClasificado[] =>
  [...requisitos]
    .sort((a, b) => a.orden - b.orden)
    .map((requisito) => ({ requisito, clase: claseDe(requisito, conRepresentante) }));

export const campoRequisito = (requisitoId: number): string =>
  `documentos.requisito.${String(requisitoId)}`;

/**
 * Revisa los adjuntos contra la clasificación: un error por cada obligatorio sin documento, por cada
 * documento de un requisito que no es de la receta o no aplica, y por cada requisito o documento
 * repetido.
 */
export const revisarAdjuntos = (
  clasificacion: readonly RequisitoClasificado[],
  adjuntos: readonly DocumentoAdjunto[],
): ErrorCampoSolicitud[] => {
  const errores: ErrorCampoSolicitud[] = [];
  const porId = new Map(clasificacion.map((item) => [item.requisito.id, item]));
  const requisitosVistos = new Set<number>();
  const documentosVistos = new Set<string>();

  for (const adjunto of adjuntos) {
    const item = porId.get(adjunto.requisitoId);
    const campo = campoRequisito(adjunto.requisitoId);
    if (item === undefined) {
      errores.push({ campo, mensaje: 'No es un requisito de esta licencia' });
    } else if (item.clase === 'NO_APLICA') {
      errores.push({ campo, mensaje: 'Este requisito no aplica a tu solicitud' });
    } else if (requisitosVistos.has(adjunto.requisitoId)) {
      errores.push({ campo, mensaje: 'Adjunta un solo documento por requisito' });
    } else if (documentosVistos.has(adjunto.documentoId)) {
      errores.push({ campo, mensaje: 'El mismo documento está en otro requisito' });
    }
    requisitosVistos.add(adjunto.requisitoId);
    documentosVistos.add(adjunto.documentoId);
  }

  for (const { requisito, clase } of clasificacion) {
    if (clase === 'OBLIGATORIO' && !requisitosVistos.has(requisito.id)) {
      errores.push({
        campo: campoRequisito(requisito.id),
        mensaje: 'Falta el documento de este requisito obligatorio',
      });
    }
  }
  return errores;
};
