import { fechaLima, inicioDiaLima, sumarDias } from '../../../compartido/dominio/fecha-lima';
import type { CifrasUsuarios } from './puertos/consulta-panel';
import type { FilaAuditoria } from './puertos/repositorio-auditoria';
import { ROLES, type Rol } from './rol';

/** Desde cuándo se cuentan los ingresos fallidos de hoy y de los últimos 7 días (hora de Lima). */
export interface LimitesIngresosFallidos {
  readonly hoy: Date;
  readonly ultimos7Dias: Date;
}

/** "Hoy" empieza a las 00:00 de Lima; "7 días" incluye hoy y los 6 anteriores (research §R-06). */
export const limitesIngresosFallidos = (ahora: Date): LimitesIngresosFallidos => {
  const hoy = fechaLima(ahora);
  return { hoy: inicioDiaLima(hoy), ultimos7Dias: inicioDiaLima(sumarDias(hoy, -6)) };
};

export interface PanelAdministrador {
  readonly usuarios: { readonly activos: number; readonly inactivos: number };
  readonly porRol: Readonly<Record<Rol, number>>;
  /** `null` si no se pudo consultar el servicio de bloqueos: no se inventa un 0 (FR-004). */
  readonly bloqueos: { readonly cuentas: number; readonly origenes: number } | null;
  readonly sesionesAbiertas: number;
  readonly ingresosFallidos: { readonly hoy: number; readonly ultimos7Dias: number };
  readonly ultimosEventos: readonly FilaAuditoria[];
}

/** Arma las cifras del panel: los 6 roles siempre presentes, aunque tengan 0 usuarios. */
export const armarPanel = (datos: {
  readonly cifras: CifrasUsuarios;
  readonly bloqueos: { readonly cuentas: number; readonly origenes: number } | null;
  readonly fallidosHoy: number;
  readonly fallidos7Dias: number;
  readonly ultimosEventos: readonly FilaAuditoria[];
}): PanelAdministrador => ({
  usuarios: { activos: datos.cifras.activos, inactivos: datos.cifras.inactivos },
  porRol: Object.fromEntries(ROLES.map((rol) => [rol, datos.cifras.porRol[rol] ?? 0])) as Record<
    Rol,
    number
  >,
  bloqueos: datos.bloqueos,
  sesionesAbiertas: datos.cifras.sesionesAbiertas,
  ingresosFallidos: { hoy: datos.fallidosHoy, ultimos7Dias: datos.fallidos7Dias },
  ultimosEventos: datos.ultimosEventos.slice(0, 10),
});
