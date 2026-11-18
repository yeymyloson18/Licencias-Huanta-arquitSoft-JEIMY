/** Los 6 roles del personal (RF17), cargados en seguridad.rol por datos-semilla.sql. */
export const ROLES = [
  'MESA_PARTES',
  'EVALUADOR',
  'INSPECTOR',
  'CAJA',
  'JEFATURA',
  'ADMINISTRADOR',
] as const;

export type Rol = (typeof ROLES)[number];

export const esRol = (valor: unknown): valor is Rol =>
  typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
