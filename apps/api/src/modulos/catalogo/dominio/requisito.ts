import { ErrorDominio } from './error-dominio';

// Requisito de una receta (data-model.md §2 de la 003). La condición indica cuándo se pide: siempre,
// solo si actúa un representante, solo si el giro lo exige, o solo si no hay planos vigentes.

export type CondicionRequisito =
  'SIEMPRE' | 'CON_REPRESENTANTE' | 'GIRO_ESPECIAL' | 'SIN_PLANOS_VIGENTES';

export const CONDICIONES_REQUISITO: readonly CondicionRequisito[] = [
  'SIEMPRE',
  'CON_REPRESENTANTE',
  'GIRO_ESPECIAL',
  'SIN_PLANOS_VIGENTES',
];

/** Largo máximo de la descripción, ya recortada (FR-019). */
export const LONGITUD_MAXIMA_DESCRIPCION = 500;

export interface Requisito {
  /** `null` si todavía no existe en el catálogo (requisito nuevo al editar). */
  readonly id: number | null;
  readonly orden: number;
  readonly descripcion: string;
  readonly obligatorio: boolean;
  readonly condicion: CondicionRequisito;
}

/** Datos primitivos de un requisito, tal como llegan de la base, de la caché o de una edición. */
export interface DatosRequisito {
  readonly id: number | null;
  readonly orden: number;
  readonly descripcion: string;
  readonly obligatorio: boolean;
  readonly condicion: string;
}

export const esCondicionRequisito = (valor: unknown): valor is CondicionRequisito =>
  CONDICIONES_REQUISITO.includes(valor as CondicionRequisito);

const esEnteroPositivo = (valor: number): boolean => Number.isInteger(valor) && valor >= 1;

export const crearRequisito = (datos: DatosRequisito): Requisito => {
  if (datos.id !== null && !esEnteroPositivo(datos.id)) {
    throw new ErrorDominio('El identificador del requisito debe ser un entero positivo');
  }
  if (!esEnteroPositivo(datos.orden)) {
    throw new ErrorDominio('El orden del requisito debe ser un entero mayor o igual a 1');
  }
  const descripcion = datos.descripcion.trim();
  if (descripcion.length === 0) {
    throw new ErrorDominio('La descripción del requisito no puede estar vacía');
  }
  if (descripcion.length > LONGITUD_MAXIMA_DESCRIPCION) {
    throw new ErrorDominio(
      `La descripción del requisito no puede superar ${String(LONGITUD_MAXIMA_DESCRIPCION)} caracteres`,
    );
  }
  if (!esCondicionRequisito(datos.condicion)) {
    throw new ErrorDominio(
      `La condición del requisito debe ser ${CONDICIONES_REQUISITO.join(', ')}`,
    );
  }

  return Object.freeze({
    id: datos.id,
    orden: datos.orden,
    descripcion,
    obligatorio: datos.obligatorio,
    condicion: datos.condicion,
  });
};
