import { CodigoReceta } from './codigo-receta';
import { ErrorDominio } from './error-dominio';
import { PlazoDiasHabiles } from './plazo-dias-habiles';
import { Tasa } from './tasa';

// Receta del catálogo del TUPA 2024 (data-model.md §1). En esta funcionalidad solo se lee.

export type TipoReceta = 'LICENCIA' | 'TRAMITE_CONECTADO';
export type Ruta = 'A' | 'B' | 'C';

export const TIPOS_RECETA: readonly TipoReceta[] = ['LICENCIA', 'TRAMITE_CONECTADO'];
export const RUTAS: readonly Ruta[] = ['A', 'B', 'C'];

const LONGITUD_MAXIMA_NOMBRE = 150;

export interface Receta {
  readonly codigo: CodigoReceta;
  readonly nombre: string;
  readonly tipo: TipoReceta;
  readonly ruta: Ruta | null;
  readonly tasa: Tasa;
  readonly plazoDias: PlazoDiasHabiles | null;
}

/** Datos primitivos de una receta, tal como llegan de la base o de la caché. */
export interface DatosReceta {
  readonly codigo: string;
  readonly nombre: string;
  readonly tipo: TipoReceta;
  readonly ruta: Ruta | null;
  readonly tasa: string;
  readonly plazoDias: number | null;
}

export const esTipoReceta = (valor: unknown): valor is TipoReceta =>
  TIPOS_RECETA.includes(valor as TipoReceta);

export const esRuta = (valor: unknown): valor is Ruta => RUTAS.includes(valor as Ruta);

export const crearReceta = (datos: DatosReceta): Receta => {
  const nombre = datos.nombre.trim();
  if (nombre.length === 0) {
    throw new ErrorDominio('El nombre de la receta no puede estar vacío');
  }
  if (datos.nombre.length > LONGITUD_MAXIMA_NOMBRE) {
    throw new ErrorDominio(
      `El nombre de la receta no puede superar ${String(LONGITUD_MAXIMA_NOMBRE)} caracteres`,
    );
  }
  if (datos.tipo === 'LICENCIA' && datos.ruta === null) {
    throw new ErrorDominio(`La licencia ${datos.codigo} debe tener una ruta (A, B o C)`);
  }

  return Object.freeze({
    codigo: CodigoReceta.crear(datos.codigo),
    nombre: datos.nombre,
    tipo: datos.tipo,
    ruta: datos.ruta,
    tasa: Tasa.desdeTexto(datos.tasa),
    plazoDias: datos.plazoDias === null ? null : PlazoDiasHabiles.crear(datos.plazoDias),
  });
};

/** Operación inversa de `crearReceta`: útil para serializar (caché) o mapear a DTO. */
export const aDatosReceta = (receta: Receta): DatosReceta => ({
  codigo: receta.codigo.valor,
  nombre: receta.nombre,
  tipo: receta.tipo,
  ruta: receta.ruta,
  tasa: receta.tasa.aTextoSoles(),
  plazoDias: receta.plazoDias?.dias ?? null,
});
