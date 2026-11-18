import type { ErrorCampoReceta } from './error-validacion-receta';
import type { Ruta, TipoReceta } from './receta';
import type { Calificacion, OrdenItse } from './receta-completa';

// Coherencia de una receta con su ruta (data-model.md §2 y research §R-03 de la 003). La tabla es
// un dato del dominio: si la Municipalidad cambia una regla, se cambia aquí y en ningún otro lugar.

export type ClaseReceta = Ruta | 'TRAMITE_CONECTADO';

export interface ReglaCoherencia {
  readonly descripcion: string;
  readonly calificaciones: readonly Calificacion[];
  /** `null` = no lleva ITSE. */
  readonly ordenItse: OrdenItse | null;
  /** `REQUERIDO` = entero ≥ 1; `VACIO` = debe ser null. */
  readonly plazoItse: 'REQUERIDO' | 'VACIO';
  /** `OPCIONAL` = null (indeterminada) o ≥ 1; `VACIA` = debe ser null. */
  readonly vigencia: 'OPCIONAL' | 'VACIA';
}

export const COHERENCIA_POR_RUTA: Readonly<Record<ClaseReceta, ReglaCoherencia>> = {
  A: {
    descripcion: 'una licencia de la ruta A',
    calificaciones: ['APROBACION_AUTOMATICA'],
    ordenItse: 'POSTERIOR',
    plazoItse: 'REQUERIDO',
    vigencia: 'OPCIONAL',
  },
  B: {
    descripcion: 'una licencia de la ruta B',
    calificaciones: ['EVALUACION_PREVIA_SILENCIO_POSITIVO'],
    ordenItse: 'PREVIA',
    plazoItse: 'REQUERIDO',
    vigencia: 'OPCIONAL',
  },
  C: {
    descripcion: 'una licencia de la ruta C',
    calificaciones: ['APROBACION_AUTOMATICA'],
    ordenItse: 'DENTRO_6_MESES',
    plazoItse: 'VACIO',
    vigencia: 'OPCIONAL',
  },
  TRAMITE_CONECTADO: {
    descripcion: 'un trámite conectado',
    calificaciones: ['APROBACION_AUTOMATICA', 'SERVICIO_EXCLUSIVO'],
    ordenItse: null,
    plazoItse: 'VACIO',
    vigencia: 'VACIA',
  },
};

/** Datos de la receta que intervienen en la coherencia. */
export interface DatosCoherencia {
  readonly tipo: TipoReceta;
  readonly ruta: Ruta | null;
  readonly calificacion: Calificacion;
  readonly ordenItse: OrdenItse | null;
  readonly plazoItseDias: number | null;
  readonly vigenciaMeses: number | null;
}

const claseDe = (receta: DatosCoherencia): ClaseReceta | null =>
  receta.tipo === 'TRAMITE_CONECTADO' ? 'TRAMITE_CONECTADO' : receta.ruta;

const esEnteroPositivo = (valor: number): boolean => Number.isInteger(valor) && valor >= 1;

/** Devuelve un error por cada campo que no corresponde a la ruta (vacío si es coherente). */
export const verificarCoherencia = (receta: DatosCoherencia): ErrorCampoReceta[] => {
  const clase = claseDe(receta);
  if (clase === null) {
    // `crearReceta` ya impide una licencia sin ruta; se informa igual en vez de fallar.
    return [{ campo: 'ruta', mensaje: 'La licencia no tiene ruta' }];
  }
  const regla = COHERENCIA_POR_RUTA[clase];
  const errores: ErrorCampoReceta[] = [];

  if (!regla.calificaciones.includes(receta.calificacion)) {
    errores.push({
      campo: 'calificacion',
      mensaje: `Para ${regla.descripcion} debe ser ${regla.calificaciones.join(' o ')}`,
    });
  }

  if (receta.ordenItse !== regla.ordenItse) {
    errores.push({
      campo: 'ordenItse',
      mensaje:
        regla.ordenItse === null
          ? `${capitalizar(regla.descripcion)} no lleva ITSE`
          : `Para ${regla.descripcion} debe ser ${regla.ordenItse}`,
    });
  }

  if (regla.plazoItse === 'REQUERIDO') {
    if (receta.plazoItseDias === null || !esEnteroPositivo(receta.plazoItseDias)) {
      errores.push({
        campo: 'plazoItseDias',
        mensaje: `Para ${regla.descripcion} debe ser un entero mayor o igual a 1`,
      });
    }
  } else if (receta.plazoItseDias !== null) {
    errores.push({
      campo: 'plazoItseDias',
      mensaje:
        clase === 'C'
          ? 'En la ruta C el plazo del ITSE es fijo (6 meses) y debe quedar vacío'
          : `${capitalizar(regla.descripcion)} no lleva plazo del ITSE`,
    });
  }

  if (regla.vigencia === 'VACIA' && receta.vigenciaMeses !== null) {
    errores.push({
      campo: 'vigenciaMeses',
      mensaje: `${capitalizar(regla.descripcion)} no tiene vigencia`,
    });
  }

  return errores;
};

const capitalizar = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);
