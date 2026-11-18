# Contrato: pantallas del portal (inicio de sesión, cambio de clave y gestión de usuarios)

Comportamiento observable en `apps/web` (FR-025, FR-026). Mismas reglas de la 001: primero celular,
sin desplazamiento horizontal a 360 px, controles con `label`, foco visible, mensajes con
`role="alert"` (errores) o `role="status"` (cargando), textos en español. Lighthouse móvil ≥ 90 en
accesibilidad y buenas prácticas en las tres pantallas (SC-010).

## Rutas

| Ruta | Acceso | Si no cumple |
|---|---|---|
| `/` | Público (catálogo de la 001) | — |
| `/ingresar` | Sin sesión | Con sesión → `/` |
| `/cambiar-clave` | Con sesión | Sin sesión → `/ingresar` |
| `/admin/usuarios` | Rol `ADMINISTRADOR` | Sin sesión → `/ingresar`; otro rol → mensaje "No tiene permiso para ver esta página" |

Con `debeCambiarClave = true`, cualquier ruta protegida redirige a `/cambiar-clave`.

## `/ingresar`

1. **Paso 1**: campos "Correo" (`type="email"`, `autocomplete="username"`) y "Clave"
   (`type="password"`, `autocomplete="current-password"`), botón "Continuar".
2. **Paso 2**: texto "Enviamos un código al celular 9*****321", campo "Código"
   (`inputmode="numeric"`, `autocomplete="one-time-code"`, 6 dígitos), botón "Ingresar", enlace
   "Enviar otro código" (repite el paso 1 con los datos en memoria) y "Volver".
3. Mensajes:

| Respuesta | Mensaje |
|---|---|
| 401 | "Correo, clave o código incorrectos." |
| 429 | "Demasiados intentos. Puede volver a intentarlo a las HH:MM." (hora local calculada con `Retry-After`) |
| 503 / red | "El inicio de sesión no está disponible en este momento. Inténtelo en unos minutos." |

Nunca se muestran el correo ni el celular completos en mensajes; la clave y el código se borran del
estado al terminar o al volver.

## `/cambiar-clave`

Campos "Clave actual", "Clave nueva" y "Repetir clave nueva" (`autocomplete="new-password"`), con la
política visible ("al menos 12 caracteres, con letras y números"). Valida en el navegador que ambas
nuevas coincidan; los errores del 422 se muestran junto a cada campo. Al terminar, va a `/` con el
mensaje "Su clave se cambió".

## `/admin/usuarios`

- Lista paginada (20 por página) con nombre, correo, roles (etiquetas) y estado; en celular cada
  usuario es una tarjeta. Cuadro de búsqueda (usa `POST /usuarios/busqueda`) y filtro "Activos /
  Inactivos / Todos".
- "Nuevo usuario": correo, nombre completo, celular, clave temporal y casillas de los 6 roles (al
  menos uno). Recordatorio: "Entregue la clave temporal en persona; el usuario deberá cambiarla al
  ingresar".
- "Editar": nombre, celular nuevo (opcional; el actual se muestra siempre enmascarado, `9*****321`,
  FR-028), activo, roles.
  "Asignar clave temporal" con confirmación.
- Errores: 409 `correo-en-uso` junto al campo correo; 409 `ultimo-administrador` como alerta
  "Debe existir al menos un administrador activo"; 422 junto a cada campo.
- Estados: cargando (`role="status"`), lista vacía ("No hay usuarios que coincidan") y error con
  botón "Reintentar".

## Sesión en el navegador

- El token de acceso vive solo en memoria (contexto de React); nunca en `localStorage`,
  `sessionStorage` ni cookies legibles por JavaScript.
- Al abrir o recargar la página se llama a `/auth/renovar` para recuperar la sesión desde la cookie.
- Renovación: antes de que venza el token (a los 13 min) si hubo actividad en los últimos 30 min, y
  ante un 401 (una sola vez, luego reintenta la petición). Las renovaciones se serializan entre
  pestañas con `navigator.locks` (research §R-06).
- 30 minutos sin actividad (teclado, toque, clic) → cierra sesión y muestra `/ingresar` con el
  mensaje "Su sesión se cerró por inactividad".
- El menú muestra solo las opciones de los roles del usuario y el botón "Cerrar sesión".
