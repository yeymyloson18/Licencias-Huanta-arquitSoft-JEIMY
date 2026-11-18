# Contrato: cambios a `docs/06-contrato-api/openapi.yaml`

Principio II: estos cambios se hacen en `openapi.yaml` **antes** del código, en el mismo PR. El job
`contrato` (redocly lint) y las pruebas de integración (Ajv contra el contrato) los verifican.
Todas las rutas llevan el prefijo `/api/v1`.

## 1. Operaciones nuevas

| Operación | Ruta | Seguridad | Cuerpo | Respuestas |
|---|---|---|---|---|
| `cambiarClave` | `POST /auth/cambiar-clave` | `bearerPersonal` (permitida aunque `debeCambiarClave` sea `true`) | `CambioClave { claveActual, claveNueva }` | `200 SesionPersonal` (token nuevo sin `dcc`; renueva la cookie) · `401` · `422` (política o igual a la actual) · `429` |
| `asignarClaveTemporal` | `POST /usuarios/{usuarioId}/clave-temporal` | `bearerPersonal`, solo `ADMINISTRADOR` | `{ claveTemporal }` | `204` · `401` · `403` · `404` · `422` |
| `buscarUsuarios` | `POST /usuarios/busqueda` | `bearerPersonal`, solo `ADMINISTRADOR` | `BusquedaUsuarios { texto?, activo?, pagina?, porPagina? }` | `200` página de `Usuario` · `401` · `403` · `422` |

`POST /usuarios/busqueda` reemplaza al parámetro `buscar` de `GET /usuarios` que proponía la entrada,
para que el nombre o el correo buscado no aparezca en la URL (principio VII; research §R-13).

## 2. Operaciones modificadas

| Operación | Cambio |
|---|---|
| `iniciarSesion` | `429` ahora cubre también "3 códigos en 15 minutos" (FR-002a) con `Retry-After`. Agrega `503` (no se pueden comprobar los límites porque Redis no responde, research §R-08). `CredencialesPersonal.clave` pasa a `minLength: 1` (el inicio de sesión no revela la política; responde siempre `401`). |
| `verificarOtpPersonal` | `200` devuelve `SesionPersonal` **y** la cabecera `Set-Cookie: refresh_personal=…; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=…`. Agrega `503`. |
| `renovarSesion` | Sin cuerpo: lee la cookie `refresh_personal` (se declara como `securityScheme` `cookieRefresh`, `type: apiKey, in: cookie`). `200` devuelve `SesionPersonal` y una cookie nueva (rotación). `401` si la cookie falta, venció, superó 30 min sin actividad, fue revocada o reutilizada. |
| `cerrarSesion` | `security: [{ cookieRefresh: [] }]` en lugar de `bearerPersonal`: funciona aunque el token de acceso haya vencido. Siempre `204` (idempotente) y `Set-Cookie` que borra la cookie. |
| `listarUsuarios` | Sin cambios de parámetros (`pagina`, `porPagina`, `activo`). |
| `crearUsuario` | `NuevoUsuario` agrega `claveTemporal` (obligatorio). `409` con `type` `correo-en-uso`. |
| `actualizarUsuario` | Agrega `409` (`ultimo-administrador`) y `422`. |
| `asignarRoles` | Agrega `409` (`ultimo-administrador`) y `422`. Semántica: reemplaza los roles vigentes; los retirados quedan en el historial (FR-019). |

## 3. Esquemas

```yaml
SesionPersonal:            # se elimina refreshToken (va en la cookie)
  required: [accessToken, expiraEn, debeCambiarClave, usuario]
  properties:
    accessToken: { type: string }
    expiraEn: { type: integer, description: Segundos de vida del accessToken (900). }
    debeCambiarClave: { type: boolean }
    usuario: { $ref: '#/components/schemas/Usuario' }

Usuario:                   # + celularEnmascarado, + debeCambiarClave
  required: [id, correo, nombreCompleto, celularEnmascarado, roles, activo, debeCambiarClave]
  properties:
    id: { type: string, format: uuid }
    correo: { type: string, format: email }
    nombreCompleto: { type: string }
    celularEnmascarado: { type: string, example: '9*****321' }
    roles: { type: array, items: { $ref: '#/components/schemas/Rol' } }
    activo: { type: boolean }
    debeCambiarClave: { type: boolean }

NuevoUsuario:              # + claveTemporal
  required: [correo, nombreCompleto, celular, claveTemporal, roles]
  properties:
    claveTemporal: { $ref: '#/components/schemas/Clave' }

Clave:                     # nuevo: política FR-022a
  type: string
  format: password
  minLength: 12
  maxLength: 128
  pattern: '^(?=.*[A-Za-z])(?=.*[0-9]).+$'

CambioClave:               # nuevo
  required: [claveActual, claveNueva]
  properties:
    claveActual: { type: string, format: password, minLength: 1, maxLength: 128 }
    claveNueva: { $ref: '#/components/schemas/Clave' }

BusquedaUsuarios:          # nuevo
  properties:
    texto: { type: string, minLength: 2, maxLength: 150, description: Fragmento del nombre o correo exacto. }
    activo: { type: boolean }
    pagina: { type: integer, minimum: 1, default: 1 }
    porPagina: { type: integer, minimum: 1, maximum: 100, default: 20 }
```

El celular nunca se devuelve completo (FR-028): para cambiarlo, el administrador escribe el número
nuevo en `actualizarUsuario`.

## 4. Respuestas y tipos de problema (`Problema.type`)

| `type` (sufijo de `https://licencias.example.pe/errores/`) | Estado | Cuándo | `title` |
|---|---|---|---|
| `no-autenticado` | 401 | Sin sesión válida o credenciales incorrectas (mensaje único, FR-005) | Correo, clave o código incorrectos, o la sesión terminó |
| `sin-permiso` | 403 | Ningún rol admitido (FR-013) | No tiene permiso para esta operación |
| `debe-cambiar-clave` | 403 | Clave temporal pendiente (FR-022) | Debe cambiar su clave antes de continuar |
| `demasiados-intentos` | 429 | 5 fallos o 3 códigos en 15 min; `Retry-After` en segundos (FR-002a, FR-008) | Demasiados intentos. Vuelva a intentarlo más tarde |
| `ultimo-administrador` | 409 | Quedaría sin administradores activos (FR-020) | Debe existir al menos un administrador activo |
| `correo-en-uso` | 409 | Correo ya registrado (historia 5, escenario 3) | El correo ya está en uso |
| `validacion` | 422 | Datos inválidos; `errores[].campo` y `errores[].mensaje` sin repetir el valor | Los datos no cumplen las reglas de validación |
| `servicio-no-disponible` | 503 | Redis no responde durante el inicio de sesión | El inicio de sesión no está disponible en este momento |

`DemasiadosIntentos.description` pasa a: *"Se superaron 5 intentos fallidos o 3 envíos de código en
15 minutos (ADR-007, FR-002a)."*

## 5. Documentación del contrato

- `docs/06-contrato-api/README.md`: la tabla "Operaciones por módulo" agrega `cambiarClave`,
  `asignarClaveTemporal` y `buscarUsuarios`; la sección de tokens explica la cookie
  `refresh_personal`; la convención "Datos personales" menciona la búsqueda por `POST`.
- La fila "Gestionar usuarios y roles (RF22)" de la matriz de permisos no cambia (solo
  administrador). Es la fila que verifica la prueba de matriz (SC-002).
