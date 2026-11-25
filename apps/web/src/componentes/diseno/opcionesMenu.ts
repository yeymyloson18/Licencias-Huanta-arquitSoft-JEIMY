import type { Rol } from '../../servicios/clienteApi';

// Opciones del menú del personal por rol (FR-026 de la 002; 013, FR-005). Es la ÚNICA fuente: el
// menú lateral de la 013 las lee de aquí. Se movieron sin cambios desde Menu.tsx (etiquetas, rutas,
// orden y reglas); las opciones de los demás módulos se agregan aquí a medida que existan.

export interface OpcionMenu {
  readonly etiqueta: string;
  readonly ruta: string;
  /** Roles que ven la opción (basta con uno). */
  readonly roles: readonly Rol[];
}

export const OPCIONES: readonly OpcionMenu[] = [
  { etiqueta: 'Panel', ruta: '/admin', roles: ['ADMINISTRADOR'] },
  { etiqueta: 'Usuarios', ruta: '/admin/usuarios', roles: ['ADMINISTRADOR'] },
  { etiqueta: 'Catálogo', ruta: '/admin/catalogo', roles: ['ADMINISTRADOR'] },
  { etiqueta: 'Feriados', ruta: '/admin/feriados', roles: ['ADMINISTRADOR'] },
  // 009: auditoría de seguridad (accesos y configuración); la de JEFATURA sigue aparte.
  { etiqueta: 'Auditoría', ruta: '/admin/auditoria', roles: ['ADMINISTRADOR'] },
  {
    etiqueta: 'Expedientes',
    ruta: '/personal/expedientes',
    roles: ['MESA_PARTES', 'EVALUADOR', 'JEFATURA'],
  },
  { etiqueta: 'Registrar solicitud', ruta: '/personal/mesa-partes/nueva', roles: ['MESA_PARTES'] },
  { etiqueta: 'Caja', ruta: '/personal/caja', roles: ['CAJA'] },
  { etiqueta: 'Auditoría', ruta: '/personal/auditoria', roles: ['JEFATURA'] },
  { etiqueta: 'Inspecciones', ruta: '/personal/inspecciones', roles: ['JEFATURA', 'INSPECTOR'] },
  { etiqueta: 'Alertas', ruta: '/personal/alertas', roles: ['JEFATURA'] },
  { etiqueta: 'Tablero', ruta: '/personal/tablero', roles: ['JEFATURA'] },
];

/** Las opciones que ve una persona con estos roles, en el orden del menú. */
export const opcionesDe = (roles: readonly Rol[]): OpcionMenu[] =>
  OPCIONES.filter((opcion) => opcion.roles.some((rol) => roles.includes(rol)));
