import { ErrorDominio } from './error-dominio';
import { crearReceta, type Receta, type Ruta, type TipoReceta } from './receta';
import { crearRequisito, type DatosRequisito, type Requisito } from './requisito';

// Receta completa del catálogo (data-model.md §2 de la 003): la que se muestra en la ficha, la que
// propone el asistente y la que edita el administrador. Extiende el resumen de la 001 (`Receta`),
// así que sus validaciones (código, nombre, ruta de una licencia, tasa y plazo) se reutilizan.

export type TipoPlazo = 'HABILES' | 'CALENDARIO';
export type Calificacion =
  'APROBACION_AUTOMATICA' | 'EVALUACION_PREVIA_SILENCIO_POSITIVO' | 'SERVICIO_EXCLUSIVO';
export type OrdenItse = 'POSTERIOR' | 'PREVIA' | 'DENTRO_6_MESES';
export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO' | 'MUY_ALTO';

export const TIPOS_PLAZO: readonly TipoPlazo[] = ['HABILES', 'CALENDARIO'];
export const CALIFICACIONES: readonly Calificacion[] = [
  'APROBACION_AUTOMATICA',
  'EVALUACION_PREVIA_SILENCIO_POSITIVO',
  'SERVICIO_EXCLUSIVO',
];
export const ORDENES_ITSE: readonly OrdenItse[] = ['POSTERIOR', 'PREVIA', 'DENTRO_6_MESES'];
export const NIVELES_RIESGO: readonly NivelRiesgo[] = ['BAJO', 'MEDIO', 'ALTO', 'MUY_ALTO'];

export interface RecetaCompleta extends Receta {
  readonly codigoTupa: string;
  readonly paginaTupa: number;
  readonly nivelRiesgo: NivelRiesgo | null;
  readonly tipoPlazo: TipoPlazo;
  readonly calificacion: Calificacion;
  readonly ordenItse: OrdenItse | null;
  readonly plazoItseDias: number | null;
  /** `null` = vigencia indeterminada. */
  readonly vigenciaMeses: number | null;
  readonly activa: boolean;
  /** Ordenados por `orden`. */
  readonly requisitos: readonly Requisito[];
  readonly actualizadaEn: Date;
}

/** Datos primitivos de una receta completa (base de datos, caché o DTO). */
export interface DatosRecetaCompleta {
  readonly codigo: string;
  readonly nombre: string;
  readonly tipo: TipoReceta;
  readonly ruta: Ruta | null;
  readonly codigoTupa: string;
  readonly paginaTupa: number;
  readonly nivelRiesgo: string | null;
  readonly tasa: string;
  readonly plazoDias: number | null;
  readonly tipoPlazo: string;
  readonly calificacion: string;
  readonly ordenItse: string | null;
  readonly plazoItseDias: number | null;
  readonly vigenciaMeses: number | null;
  readonly activa: boolean;
  readonly requisitos: readonly DatosRequisito[];
  /** Fecha en formato ISO 8601. */
  readonly actualizadaEn: string;
}

export const pertenece = <T extends string>(lista: readonly T[], valor: unknown): valor is T =>
  lista.includes(valor as T);

const validarEnumeracion = <T extends string>(
  lista: readonly T[],
  valor: unknown,
  campo: string,
): T => {
  if (!pertenece(lista, valor)) {
    throw new ErrorDominio(`${campo} debe ser ${lista.join(', ')}`);
  }
  return valor;
};

const validarEnumeracionOpcional = <T extends string>(
  lista: readonly T[],
  valor: string | null,
  campo: string,
): T | null => (valor === null ? null : validarEnumeracion(lista, valor, campo));

const validarEnteroPositivoOpcional = (valor: number | null, campo: string): number | null => {
  if (valor !== null && (!Number.isInteger(valor) || valor < 1)) {
    throw new ErrorDominio(`${campo} debe ser un entero mayor o igual a 1`);
  }
  return valor;
};

export const esCalificacion = (valor: unknown): valor is Calificacion =>
  pertenece(CALIFICACIONES, valor);
export const esOrdenItse = (valor: unknown): valor is OrdenItse => pertenece(ORDENES_ITSE, valor);

export const crearRecetaCompleta = (datos: DatosRecetaCompleta): RecetaCompleta => {
  const resumen = crearReceta(datos);

  if (datos.codigoTupa.trim().length === 0) {
    throw new ErrorDominio('El código del TUPA no puede estar vacío');
  }
  if (!Number.isInteger(datos.paginaTupa) || datos.paginaTupa < 1) {
    throw new ErrorDominio('La página del TUPA debe ser un entero mayor o igual a 1');
  }
  const actualizadaEn = new Date(datos.actualizadaEn);
  if (Number.isNaN(actualizadaEn.getTime())) {
    throw new ErrorDominio('La fecha de actualización de la receta no es válida');
  }

  const requisitos = datos.requisitos
    .map(crearRequisito)
    .sort((primero, segundo) => primero.orden - segundo.orden);

  return Object.freeze({
    ...resumen,
    codigoTupa: datos.codigoTupa,
    paginaTupa: datos.paginaTupa,
    nivelRiesgo: validarEnumeracionOpcional(
      NIVELES_RIESGO,
      datos.nivelRiesgo,
      'El nivel de riesgo',
    ),
    tipoPlazo: validarEnumeracion(TIPOS_PLAZO, datos.tipoPlazo, 'El tipo de plazo'),
    calificacion: validarEnumeracion(CALIFICACIONES, datos.calificacion, 'La calificación'),
    ordenItse: validarEnumeracionOpcional(ORDENES_ITSE, datos.ordenItse, 'El orden del ITSE'),
    plazoItseDias: validarEnteroPositivoOpcional(datos.plazoItseDias, 'El plazo del ITSE'),
    vigenciaMeses: validarEnteroPositivoOpcional(datos.vigenciaMeses, 'La vigencia'),
    activa: datos.activa,
    requisitos: Object.freeze(requisitos),
    actualizadaEn,
  });
};

/** Operación inversa de `crearRecetaCompleta`: para la caché y para mapear a DTO. */
export const aDatosRecetaCompleta = (receta: RecetaCompleta): DatosRecetaCompleta => ({
  codigo: receta.codigo.valor,
  nombre: receta.nombre,
  tipo: receta.tipo,
  ruta: receta.ruta,
  codigoTupa: receta.codigoTupa,
  paginaTupa: receta.paginaTupa,
  nivelRiesgo: receta.nivelRiesgo,
  tasa: receta.tasa.aTextoSoles(),
  plazoDias: receta.plazoDias?.dias ?? null,
  tipoPlazo: receta.tipoPlazo,
  calificacion: receta.calificacion,
  ordenItse: receta.ordenItse,
  plazoItseDias: receta.plazoItseDias,
  vigenciaMeses: receta.vigenciaMeses,
  activa: receta.activa,
  requisitos: receta.requisitos.map((requisito) => ({
    id: requisito.id,
    orden: requisito.orden,
    descripcion: requisito.descripcion,
    obligatorio: requisito.obligatorio,
    condicion: requisito.condicion,
  })),
  actualizadaEn: receta.actualizadaEn.toISOString(),
});
