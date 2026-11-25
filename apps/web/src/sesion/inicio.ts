// Pantalla de llegada después de ingresar (011): cada rol llega a su trabajo y el regreso a una
// pantalla pedida antes de ingresar solo acepta rutas internas permitidas para sus roles.

/** Pantalla principal de cada rol, en orden de prioridad para quien tiene varios (FR-012, FR-013). */
const PRIORIDAD_INICIO: readonly { readonly rol: string; readonly pantalla: string }[] = [
  { rol: 'ADMINISTRADOR', pantalla: '/admin' },
  { rol: 'MESA_PARTES', pantalla: '/personal/expedientes' },
  { rol: 'EVALUADOR', pantalla: '/personal/expedientes' },
  { rol: 'CAJA', pantalla: '/personal/caja' },
  { rol: 'INSPECTOR', pantalla: '/personal/inspecciones' },
  { rol: 'JEFATURA', pantalla: '/personal/tablero' },
];

/** Sin roles, la única pantalla a la que tiene acceso es su perfil (FR-014). */
export const PANTALLA_SIN_ROL = '/perfil';

export const inicioDe = (roles: readonly string[]): string =>
  PRIORIDAD_INICIO.find(({ rol }) => roles.includes(rol))?.pantalla ?? PANTALLA_SIN_ROL;

/** `'*'`: cualquier usuario del personal con sesión. */
type Permitidos = readonly string[] | '*';

/**
 * Quién puede abrir cada pantalla protegida; copia los `roles` de las rutas de `Aplicacion.tsx`.
 * Se busca la primera regla que coincide, así que las más específicas van primero. Una ruta sin
 * regla no se acepta como destino (falla cerrado).
 */
export const PERMISOS_PANTALLA: readonly { readonly patron: RegExp; readonly roles: Permitidos }[] =
  [
    { patron: /^\/(perfil|cambiar-clave)$/, roles: '*' },
    { patron: /^\/admin(\/.*)?$/, roles: ['ADMINISTRADOR'] },
    { patron: /^\/personal\/mesa-partes(\/.*)?$/, roles: ['MESA_PARTES'] },
    {
      patron: /^\/personal\/expedientes(\/.*)?$/,
      roles: ['MESA_PARTES', 'EVALUADOR', 'JEFATURA'],
    },
    { patron: /^\/personal\/caja$/, roles: ['CAJA'] },
    { patron: /^\/personal\/inspecciones\/[^/]+\/resultado$/, roles: ['INSPECTOR'] },
    { patron: /^\/personal\/inspecciones$/, roles: ['JEFATURA', 'INSPECTOR'] },
    { patron: /^\/personal\/(tablero|alertas|auditoria)$/, roles: ['JEFATURA'] },
  ];

/**
 * Forma de una ruta interna aceptable: empieza con UN solo `/` seguido de una sección conocida del
 * personal y solo tiene segmentos de letras, números, `_` y `-`. Es una lista blanca: rechaza
 * `//otro.sitio`, `/\otro`, `https://…`, `javascript:…`, `%2F`, `..`, `?`, `#`, `:`, `@` y espacios.
 */
const FORMA_RUTA_INTERNA = /^\/(perfil|cambiar-clave|admin|personal)(\/[A-Za-z0-9_-]+)*$/;

const permitida = (ruta: string, roles: readonly string[]): boolean => {
  const regla = PERMISOS_PANTALLA.find(({ patron }) => patron.test(ruta));
  if (regla === undefined) {
    return false;
  }
  return regla.roles === '*' || regla.roles.some((rol) => roles.includes(rol));
};

/**
 * Defensa contra redirecciones abiertas (research §R-07, FR-015): devuelve `volverA` solo si es
 * una ruta interna del portal con forma válida y permitida para alguno de los roles; si no, la
 * pantalla principal de sus roles.
 */
export const destinoDespuesDeIngresar = (volverA: unknown, roles: readonly string[]): string =>
  typeof volverA === 'string' && FORMA_RUTA_INTERNA.test(volverA) && permitida(volverA, roles)
    ? volverA
    : inicioDe(roles);
