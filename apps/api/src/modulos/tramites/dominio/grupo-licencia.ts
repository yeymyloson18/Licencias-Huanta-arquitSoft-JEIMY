// Grupos de licencias para corregir el riesgo (FR-003 de la 005, research §R-04): el evaluador solo
// puede cambiar entre licencias del mismo grupo. Bodega y corporativa tienen una sola licencia.

export type GrupoLicencia = 'ESTABLECIMIENTO' | 'CESIONARIO' | 'CORPORATIVA' | 'BODEGA';

export interface DatosGrupo {
  readonly ruta: 'A' | 'B' | 'C' | null;
  readonly esCesionario: boolean;
  readonly esCorporativa: boolean;
}

/** El grupo sale del catálogo: ruta C = bodega; luego corporativa, cesionario o establecimiento. */
export const grupoDe = (datos: DatosGrupo): GrupoLicencia => {
  if (datos.ruta === 'C') {
    return 'BODEGA';
  }
  if (datos.esCorporativa) {
    return 'CORPORATIVA';
  }
  return datos.esCesionario ? 'CESIONARIO' : 'ESTABLECIMIENTO';
};

export const mismoGrupo = (a: GrupoLicencia, b: GrupoLicencia): boolean => a === b;
