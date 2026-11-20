import { comoFechaBase, esFechaValida, type Fecha } from '../../../compartido/dominio/fecha-lima';

/** Un rango del tablero no puede pasar de un año (FR-006 de la 007). */
export const MAXIMO_DIAS_RANGO = 366;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Rango inclusivo de días de Lima. */
export interface RangoFechas {
  readonly desde: Fecha;
  readonly hasta: Fecha;
}

/** El rango pedido no es válido; `campo` indica dónde mostrar el mensaje. */
export class ErrorRangoInvalido extends Error {
  constructor(
    readonly campo: 'desde' | 'hasta',
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorRangoInvalido';
  }
}

/**
 * Rango del tablero (FR-001 y FR-006 de la 007): sin fechas, el mes actual (del día 1 a hoy); con las
 * dos, deben ser válidas, en orden y de 366 días como máximo. Con una sola, error.
 */
export const rangoDesde = (
  entrada: { readonly desde?: string; readonly hasta?: string },
  hoy: Fecha,
): RangoFechas => {
  const { desde, hasta } = entrada;
  if (desde === undefined && hasta === undefined) {
    return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  }
  if (desde === undefined) {
    throw new ErrorRangoInvalido('desde', 'Indica la fecha de inicio');
  }
  if (hasta === undefined) {
    throw new ErrorRangoInvalido('hasta', 'Indica la fecha de fin');
  }
  if (!esFechaValida(desde)) {
    throw new ErrorRangoInvalido('desde', 'Debe ser una fecha AAAA-MM-DD');
  }
  if (!esFechaValida(hasta)) {
    throw new ErrorRangoInvalido('hasta', 'Debe ser una fecha AAAA-MM-DD');
  }
  if (desde > hasta) {
    throw new ErrorRangoInvalido('hasta', 'Debe ser igual o posterior a la fecha de inicio');
  }
  const dias = (comoFechaBase(hasta).getTime() - comoFechaBase(desde).getTime()) / MS_POR_DIA + 1;
  if (dias > MAXIMO_DIAS_RANGO) {
    throw new ErrorRangoInvalido(
      'hasta',
      `El rango puede tener hasta ${String(MAXIMO_DIAS_RANGO)} días`,
    );
  }
  return { desde, hasta };
};
