# Contrato del portal: Mi perfil y pantalla de inicio por rol (011)

## Menú (`componentes/Menu.tsx`)

- Con sesión del personal: `[Nombre completo] [Mi perfil] … opciones del rol … [Cerrar sesión]`.
- "Mi perfil" es un enlace a `/perfil`, visible para cualquier rol (incluso sin roles), con
  `aria-current="page"` cuando la pantalla activa es `/perfil`.
- Sin sesión, el menú no se muestra (sin cambios). El administrado nunca ve "Mi perfil".

## `/perfil` (`paginas/personal/MiPerfil.tsx`, nueva)

- `RutaProtegida` **sin** `roles`. Sin sesión lleva a `/ingresar` con `volverA: '/perfil'`; con clave
  temporal, a `/cambiar-clave`.
- Título `<h1>Mi perfil</h1>`. Los datos van en una lista de definiciones (`<dl>`):
  - Nombre completo
  - Correo
  - Celular (`9*****321`)
  - Roles (nombres en pantalla, separados por coma; "Sin roles" si no hay)
  - Último ingreso (fecha y hora local; "Sin registro" si es `null`)
  - Sesiones abiertas ("1 sesión abierta" / "N sesiones abiertas")
- Botón o enlace "Cambiar mi clave" que lleva a `/cambiar-clave`.
- Avisos (`role="status"`):
  - `state.aviso` → "Su clave se cambió".
  - `state.sinRol` → "Todavía no tiene un rol asignado. Consulte con el administrador."
- Estados:
  - mientras carga, "Cargando…";
  - si la API responde 401, el cliente ya intenta renovar la sesión y, si falla, lleva a `/ingresar`;
  - ante otro error, `role="alert"` con "No se pudo cargar su perfil. Inténtelo de nuevo." y un botón
    para reintentar.
- Nada de datos personales en la URL ni en `console`.

## `/cambiar-clave` (`paginas/CambiarClave.tsx`, se amplía)

- Mismos campos y mensajes de la 002: "Clave actual", "Clave nueva", "Repita la clave nueva",
  "Las claves nuevas no coinciden", "La clave actual no es correcta" y "Demasiados intentos. Vuelva a
  intentarlo más tarde.", más los errores de la política junto al campo.
- Si la sesión **no** tenía clave temporal, muestra un enlace "Volver a mi perfil" y, al terminar
  bien, navega a `/perfil` con `state.aviso = 'Su clave se cambió'` (`replace`).
- Si la sesión tenía clave temporal, al terminar bien navega a `inicioDe(roles)` con el mismo aviso
  (cambia el destino: antes era `/` para los que no son administradores).

## Pantalla de inicio y regreso seguro (`sesion/inicio.ts`)

- `inicioDe(roles)`: aplica la tabla de prioridad de `data-model.md`. Sin roles, `/perfil`.
- `destinoDespuesDeIngresar(volverA, roles)`:
  - acepta solo rutas internas que empiezan con un único `/` y cumplen
    `^\/(perfil|cambiar-clave|admin|personal)(\/[A-Za-z0-9_-]+)*$`;
  - además, la ruta debe estar permitida para alguno de los roles (`PERMISOS_PANTALLA`);
  - en cualquier otro caso devuelve `inicioDe(roles)`.
- `Ingresar.tsx` reemplaza su `destinoSeguro` local por esta función.

### Entradas que deben terminar en la pantalla del rol (prueba obligatoria)

`'//evil.example'`, `'//evil.example/admin'`, `'/\\evil.example'`, `'https://evil.example'`,
`'http:/evil.example'`, `'javascript:alert(1)'`, `'/%2F%2Fevil.example'`, `'/admin/../..'`,
`'/admin?x=1'`, `'/admin#x'`, `'/admin/ x'`, `'evil.example'`, `''`, `'/'`, `'/consulta'`,
`null`, `undefined`, `42`, `{}` y una ruta válida para la que no se tiene rol (por ejemplo,
`'/admin'` con rol `CAJA`).

### Entradas que deben respetarse

`'/perfil'` (cualquier rol), `'/personal/caja'` con `CAJA`,
`'/personal/expedientes/EXP-2026-000123'` con `EVALUADOR` y `'/admin/usuarios'` con
`ADMINISTRADOR`.

## Accesibilidad (EQ-05)

Menú, `/perfil` y `/cambiar-clave` a 360 px: sin desplazamiento horizontal, foco visible, orden de
tabulación lógico, etiquetas asociadas y avisos con `role="status"` o `role="alert"`. Lighthouse
≥ 90 en accesibilidad.
