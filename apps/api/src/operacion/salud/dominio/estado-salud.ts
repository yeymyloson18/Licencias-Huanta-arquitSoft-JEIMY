// Estado de salud del servicio (data-model.md §2). Dominio puro: sin dependencias externas.

export type EstadoDependencia = 'OK' | 'CAIDO';
export type EstadoGeneral = 'OK' | 'DEGRADADO' | 'CAIDO';

export interface EstadoSalud {
  readonly estado: EstadoGeneral;
  readonly baseDeDatos: EstadoDependencia;
  readonly cache: EstadoDependencia;
  readonly version: string;
}

/**
 * Sin base de datos la instancia no puede atender (CAIDO); sin caché sigue atendiendo más lento
 * (DEGRADADO, ADR-005).
 */
export const calcularEstadoGeneral = (
  baseDeDatos: EstadoDependencia,
  cache: EstadoDependencia,
): EstadoGeneral => {
  if (baseDeDatos === 'CAIDO') {
    return 'CAIDO';
  }
  return cache === 'CAIDO' ? 'DEGRADADO' : 'OK';
};
