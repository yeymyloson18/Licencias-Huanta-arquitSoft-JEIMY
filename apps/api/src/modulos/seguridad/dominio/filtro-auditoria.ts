import {
  esFechaValida,
  type Fecha,
  inicioDiaLima,
  sumarDias,
} from '../../../compartido/dominio/fecha-lima';
import type { AccionAuditoria } from './accion-auditoria';
import type { FiltroAuditoria } from './puertos/repositorio-auditoria';

/** Sin fechas, la consulta muestra los últimos 30 días (research §R-08 de la 009). */
export const DIAS_POR_DEFECTO = 30;
/** Rango máximo de una consulta: un año (366 días por los bisiestos). */
export const DIAS_MAXIMOS = 366;

/** Filtro con fechas inválidas: `campos` nombra cuáles, sin repetir el valor. */
export class ErrorFiltroAuditoria extends Error {
  constructor(readonly campos: readonly ('desde' | 'hasta')[]) {
    super(`Filtro de auditoría inválido: ${campos.join(', ')}`);
    this.name = 'ErrorFiltroAuditoria';
  }
}

export interface EntradaFiltroAuditoria {
  readonly desde?: string;
  readonly hasta?: string;
  readonly accion?: AccionAuditoria;
  readonly actorId?: string;
  readonly afectadoId?: string;
}

const diasEntre = (desde: Fecha, hasta: Fecha): number =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/**
 * Convierte las fechas de Lima del filtro en instantes: desde las 00:00 de `desde` hasta las 00:00
 * del día siguiente a `hasta` (exclusivo). Falta `hasta` → hoy; falta `desde` → 30 días hasta
 * `hasta`. Rechaza fechas inválidas, `desde` posterior a `hasta` y rangos de más de 366 días.
 */
export const resolverFiltroAuditoria = (
  entrada: EntradaFiltroAuditoria,
  hoy: Fecha,
): FiltroAuditoria => {
  const invalidos: ('desde' | 'hasta')[] = [];
  if (entrada.desde !== undefined && !esFechaValida(entrada.desde)) {
    invalidos.push('desde');
  }
  if (entrada.hasta !== undefined && !esFechaValida(entrada.hasta)) {
    invalidos.push('hasta');
  }
  if (invalidos.length > 0) {
    throw new ErrorFiltroAuditoria(invalidos);
  }

  const hasta = entrada.hasta ?? hoy;
  const desde = entrada.desde ?? sumarDias(hasta, -(DIAS_POR_DEFECTO - 1));
  const dias = diasEntre(desde, hasta) + 1;
  if (dias < 1) {
    throw new ErrorFiltroAuditoria(['desde']);
  }
  if (dias > DIAS_MAXIMOS) {
    throw new ErrorFiltroAuditoria(['desde', 'hasta']);
  }

  return {
    desde: inicioDiaLima(desde),
    hasta: inicioDiaLima(sumarDias(hasta, 1)),
    ...(entrada.accion === undefined ? {} : { accion: entrada.accion }),
    ...(entrada.actorId === undefined ? {} : { actorId: entrada.actorId }),
    ...(entrada.afectadoId === undefined ? {} : { afectadoId: entrada.afectadoId }),
  };
};
