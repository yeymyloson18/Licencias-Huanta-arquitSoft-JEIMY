import type { DiferenciaReceta } from './diferencia-receta';

/**
 * Evento que publica el catálogo al guardar una receta (009, research §R-02): Seguridad lo consume
 * para su auditoría sin que el catálogo escriba en el esquema de seguridad. Si cambió `activa`, ese
 * cambio da nombre al evento; si no, es una actualización.
 */
export type TipoEventoCambioReceta = 'RecetaActualizada' | 'RecetaDesactivada' | 'RecetaReactivada';

export interface DatosEventoCambioReceta {
  readonly codigoReceta: string;
  /** Identificador interno de quien guardó (sin datos personales). */
  readonly usuarioId: string;
  /** Instante del cambio, en ISO 8601. */
  readonly en: string;
}

export const tipoEventoCambioReceta = (diferencias: DiferenciaReceta): TipoEventoCambioReceta => {
  const activa = diferencias.activa?.despues;
  if (activa === false) {
    return 'RecetaDesactivada';
  }
  if (activa === true) {
    return 'RecetaReactivada';
  }
  return 'RecetaActualizada';
};

export const datosEventoCambioReceta = (
  codigoReceta: string,
  usuarioId: string,
  en: Date,
): DatosEventoCambioReceta => ({ codigoReceta, usuarioId, en: en.toISOString() });
