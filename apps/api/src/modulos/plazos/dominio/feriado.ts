import { esFechaValida, type Fecha } from '../../../compartido/dominio/fecha-lima';

export type AlcanceFeriado = 'NACIONAL' | 'REGIONAL' | 'LOCAL';

const ALCANCES: readonly AlcanceFeriado[] = ['NACIONAL', 'REGIONAL', 'LOCAL'];
const MAXIMO_DESCRIPCION = 150;

/** Un dato del feriado no es válido (422); `campo` nombra el dato. */
export class ErrorDatoFeriado extends Error {
  constructor(
    readonly campo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDatoFeriado';
  }
}

export interface Feriado {
  readonly fecha: Fecha;
  readonly descripcion: string;
  readonly alcance: AlcanceFeriado;
}

/** Feriado del calendario (HU16, RF23): fecha real, descripción de 1 a 150 y alcance válido. */
export const crearFeriado = (entrada: {
  readonly fecha: string;
  readonly descripcion: string;
  readonly alcance: string;
}): Feriado => {
  if (!esFechaValida(entrada.fecha)) {
    throw new ErrorDatoFeriado('fecha', 'Debe ser una fecha AAAA-MM-DD');
  }
  const descripcion = entrada.descripcion.trim();
  if (descripcion === '' || descripcion.length > MAXIMO_DESCRIPCION) {
    throw new ErrorDatoFeriado('descripcion', 'La descripción debe tener de 1 a 150 caracteres');
  }
  if (!ALCANCES.includes(entrada.alcance as AlcanceFeriado)) {
    throw new ErrorDatoFeriado('alcance', 'El alcance debe ser NACIONAL, REGIONAL o LOCAL');
  }
  return { fecha: entrada.fecha, descripcion, alcance: entrada.alcance as AlcanceFeriado };
};
