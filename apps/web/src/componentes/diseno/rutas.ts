// Qué diseño usa cada ruta (013, FR-004 y FR-010): las pantallas del personal (/admin, /personal y
// /perfil) usan el área de administración; las demás, incluidas /ingresar y /cambiar-clave, el portal
// ligero.

export const esRutaPersonal = (ruta: string): boolean =>
  ruta === '/admin' ||
  ruta.startsWith('/admin/') ||
  ruta.startsWith('/personal/') ||
  ruta === '/perfil';
