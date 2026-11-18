// Cambios que pide el administrador (esquema `RecetaEditable` del contrato, data-model.md §2 de la
// 003). Cada campo es opcional; la presentación garantiza que llegue al menos uno y que no vengan
// campos no editables (FR-018). Los valores llegan como primitivos: el dominio los valida.

/** Un requisito de la lista nueva. Con `id` se conserva ese requisito; sin `id` es nuevo. */
export interface CambioRequisito {
  readonly id?: number;
  readonly descripcion: string;
  /** Por defecto `true`. */
  readonly obligatorio?: boolean;
  readonly condicion: string;
}

export interface CambiosReceta {
  readonly tasa?: string;
  readonly plazoDias?: number;
  readonly calificacion?: string;
  readonly ordenItse?: string | null;
  readonly plazoItseDias?: number | null;
  readonly vigenciaMeses?: number | null;
  readonly activa?: boolean;
  /** Reemplaza la lista completa; el orden lo da la posición (FR-020). */
  readonly requisitos?: readonly CambioRequisito[];
}

/** Campos editables, en el orden en que se informan las diferencias. */
export const CAMPOS_EDITABLES = [
  'tasa',
  'plazoDias',
  'calificacion',
  'ordenItse',
  'plazoItseDias',
  'vigenciaMeses',
  'activa',
  'requisitos',
] as const;

export type CampoEditable = (typeof CAMPOS_EDITABLES)[number];
