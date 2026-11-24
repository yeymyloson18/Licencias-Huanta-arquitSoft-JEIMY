import type { Rol } from '../servicios/clienteApi';

/** Los 6 roles del personal con su nombre para la pantalla (RF17). */
export const ROLES: readonly { readonly codigo: Rol; readonly nombre: string }[] = [
  { codigo: 'MESA_PARTES', nombre: 'Mesa de partes' },
  { codigo: 'EVALUADOR', nombre: 'Evaluador' },
  { codigo: 'INSPECTOR', nombre: 'Inspector' },
  { codigo: 'CAJA', nombre: 'Caja' },
  { codigo: 'JEFATURA', nombre: 'Jefatura' },
  { codigo: 'ADMINISTRADOR', nombre: 'Administrador' },
];

export const nombreDelRol = (codigo: Rol): string =>
  ROLES.find((rol) => rol.codigo === codigo)?.nombre ?? codigo;
