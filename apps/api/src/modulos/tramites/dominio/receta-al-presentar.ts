// Copia de la receta vigente al presentar (FR-017 de la 004): el expediente conserva la tasa, el plazo
// y los requisitos con los que se presentó, aunque el catálogo cambie después. Sin datos personales.

export type CondicionRequisito =
  'SIEMPRE' | 'CON_REPRESENTANTE' | 'GIRO_ESPECIAL' | 'SIN_PLANOS_VIGENTES';

export interface RequisitoAlPresentar {
  readonly id: number;
  readonly orden: number;
  readonly descripcion: string;
  readonly obligatorio: boolean;
  readonly condicion: CondicionRequisito;
}

export interface RecetaAlPresentar {
  readonly codigo: string;
  readonly nombre: string;
  readonly ruta: 'A' | 'B' | 'C';
  readonly tasa: string;
  readonly plazoDias: number | null;
  readonly tipoPlazo: string;
  readonly calificacion: string;
  readonly ordenItse: string | null;
  readonly plazoItseDias: number | null;
  readonly vigenciaMeses: number | null;
  /** En el orden del catálogo. */
  readonly requisitos: readonly RequisitoAlPresentar[];
}
