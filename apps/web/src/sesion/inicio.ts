// Página de inicio según los roles (009): el administrador entra a su panel; el resto, al inicio.

export const inicioDe = (roles: readonly string[]): string =>
  roles.includes('ADMINISTRADOR') ? '/admin' : '/';
