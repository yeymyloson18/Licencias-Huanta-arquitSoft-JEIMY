import type { EstadoGeneral } from '../dominio/estado-salud';

/**
 * Traduce el estado de salud a un código HTTP (detalle de la capa de presentación).
 * Solo CAIDO hace que el balanceador retire la instancia (503); DEGRADADO sigue recibiendo
 * tráfico (200, ADR-005).
 */
export const codigoHttpPara = (estado: EstadoGeneral): 200 | 503 =>
  estado === 'CAIDO' ? 503 : 200;
