# Modelo de datos (fase 1): Seguridad y usuarios del personal municipal

Esquema PostgreSQL `seguridad` (un esquema por módulo, MD1). Parte de lo creado por la migración
`0001` de la funcionalidad 001 y lo modifica con la migración **`0003_seguridad_usuarios`**. En el
mismo PR se actualizan `docs/05-modelo-de-datos/esquema.sql` (estado actual completo),
`modelo-entidad-relacion.md` (diagrama y diccionario) y la prueba de equivalencia de
[research.md](./research.md) §R-15. Las tablas `verificacion_identidad` y el propósito
`IDENTIDAD_ADMINISTRADO` de `codigo_otp` no se usan en esta funcionalidad (son de "presentar
solicitud").

## 1. Cambios de la migración `0003`

| Tabla | Cambio | Motivo |
|---|---|---|
| `usuario` | Se elimina `correo`; se agregan `correo_cifrado bytea NOT NULL` y `correo_hmac bytea NOT NULL UNIQUE` | Principio III / MD3: el correo es dato personal (research §R-04) |
| `usuario` | + `debe_cambiar_clave boolean NOT NULL DEFAULT false` | Clave temporal (FR-022) |
| `usuario` | + `version_seguridad integer NOT NULL DEFAULT 1 CHECK (version_seguridad > 0)` | Efecto inmediato y respaldo si Redis no responde (FR-011, FR-015; research §R-07) |
| `usuario_rol` | + `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` (deja de ser PK `(usuario_id, rol_codigo)`) | Historial: el mismo rol puede asignarse, retirarse y volver a asignarse (FR-019) |
| `usuario_rol` | + `retirado_por uuid NULL`, `retirado_en timestamptz NULL`, `CHECK ((retirado_por IS NULL) = (retirado_en IS NULL))` | Quién retiró y cuándo (aclaración 2026-11-17) |
| `usuario_rol` | + índice único parcial `ux_usuario_rol_vigente (usuario_id, rol_codigo) WHERE retirado_en IS NULL` | Un rol vigente una sola vez por usuario |
| `usuario_rol` | + índice `ix_usuario_rol_admin_vigente (rol_codigo) WHERE retirado_en IS NULL` | Contar administradores activos rápido (FR-020) |
| `sesion` | + `vence_maximo_en timestamptz NOT NULL`, `ultima_actividad_en timestamptz NOT NULL DEFAULT now()` | Máximo 8 h y cierre por inactividad de 30 min (FR-003, FR-003a) |
| `sesion` | + `refresh_anterior_hash varchar(255) NULL`, `rotada_en timestamptz NULL` | Rotación con detección de reutilización (research §R-06) |
| `sesion` | Se elimina `vence_en` (lo reemplaza `vence_maximo_en`) | Una sola fecha de vencimiento, sin ambigüedad |
| `sesion` | + índice `ix_sesion_usuario_vigente (usuario_id) WHERE revocada_en IS NULL` | Revocar todas las sesiones de un usuario |

La migración empieza con una guarda: si `seguridad.usuario` tiene filas, se detiene con
`RAISE EXCEPTION` explicando que el correo existente no se puede cifrar desde SQL. Hoy ningún entorno
tiene usuarios (esta funcionalidad crea el primero).

`asignado_por` y `retirado_por` son referencias lógicas a `seguridad.usuario(id)`; quedan sin FK para
no impedir el historial si un día se borrara un usuario (hoy no se borran: se desactivan).

## 2. Entidades del dominio

Nombres en español (principio IV). Los objetos de valor se validan al construirse y lanzan
`ErrorDominio` con un mensaje sin el valor recibido.

### Usuario (agregado raíz)

| Campo | Tipo de dominio | Reglas |
|---|---|---|
| `id` | `UsuarioId` (uuid) | Asignado al crear |
| `correo` | `Correo` | Formato de correo; se normaliza a minúsculas y sin espacios; único (por `correo_hmac`); **no editable** (FR-017) |
| `nombreCompleto` | `NombreCompleto` | 3 a 150 caracteres, sin espacios al inicio o al final |
| `celular` | `Celular` | `^9[0-9]{8}$` (FR-028, caso límite); se expone enmascarado `9*****321` |
| `claveHash` | `HuellaClave` | Solo la huella argon2id; nunca la clave |
| `debeCambiarClave` | boolean | `true` al crear (por administrador o por el paso de instalación) y al asignar clave temporal; `false` tras cambiarla |
| `activo` | boolean | `false` impide iniciar sesión (FR-010) |
| `versionSeguridad` | entero > 0 | Se incrementa al desactivar, cambiar roles, asignar clave temporal o cambiar la clave |
| `rolesVigentes` | conjunto de `Rol` | Al menos uno al crear; ver "Asignación de rol" |

Comportamientos: `desactivar()`, `reactivar()`, `asignarClaveTemporal(huella)`,
`cambiarClave(huellaNueva)`, `reemplazarRoles(roles, porUsuarioId, en)` (calcula qué asignaciones
se retiran y cuáles se crean).

### Rol

Enumeración fija: `MESA_PARTES`, `EVALUADOR`, `INSPECTOR`, `CAJA`, `JEFATURA`, `ADMINISTRADOR`
(tabla `seguridad.rol`, cargada por `datos-semilla.sql`; esta funcionalidad no la cambia).

### Asignación de rol

| Campo | Reglas |
|---|---|
| `id` | uuid |
| `usuarioId`, `rol` | Un rol vigente por usuario una sola vez |
| `asignadoPor`, `asignadoEn` | Obligatorios (FR-019) |
| `retiradoPor`, `retiradoEn` | Ambos nulos (vigente) o ambos con valor (retirada) |

Estados: **vigente** → **retirada** (terminal). Volver a dar el rol crea una asignación nueva.

### Regla "último administrador" (servicio de dominio)

`ReglaUltimoAdministrador.verificar(administradoresActivos, operacion)`: rechaza con
`ErrorUltimoAdministrador` si después de la operación (desactivar un usuario o quitarle
`ADMINISTRADOR`) quedarían 0 usuarios activos con el rol `ADMINISTRADOR` vigente (FR-020). Recibe la
lista ya bloqueada por la transacción (research §R-09).

### Política de clave (servicio de dominio)

`PoliticaClave.validar(texto)`: 12 a 128 caracteres, al menos una letra y un número (FR-022a).
Devuelve la lista de reglas incumplidas (para mostrarlas en el 422 sin repetir la clave).

### Código de un solo uso (`CodigoOtp`)

| Campo | Reglas |
|---|---|
| `id` (= `desafioId`) | uuid |
| `usuarioId` | Obligatorio para el propósito `INICIO_SESION` |
| `destinoHmac` | HMAC del celular de destino |
| `codigoHash` | HMAC del código (research §R-03) |
| `intentos` | 0 a 5 |
| `venceEn` | Creación + 5 min (FR-002) |
| `usadoEn` | Se llena al verificar con éxito; un código usado no vuelve a servir |

Estados: **vigente** → **usado** | **vencido** (por tiempo, por pedir otro código o por llegar a
5 intentos). `verificar(codigo, ahora)` devuelve `CORRECTO`, `INCORRECTO`, `VENCIDO` o `AGOTADO`.

### Sesión

| Campo | Reglas |
|---|---|
| `id` | uuid; viaja en el refresh token y en el claim `sid` |
| `usuarioId` | — |
| `refreshHash` | SHA-256 del refresh vigente |
| `refreshAnteriorHash`, `rotadaEn` | Del refresh anterior a la última rotación |
| `creadaEn`, `venceMaximoEn` | `venceMaximoEn = creadaEn + 8 h` (FR-003) |
| `ultimaActividadEn` | Se actualiza al renovar |
| `revocadaEn` | Al cerrar sesión, al desactivar al usuario, al asignarle clave temporal, al cambiar la clave (las demás sesiones) o al detectar reutilización |

Estados: **activa** → **revocada** | **vencida** (por máximo de 8 h o por 30 min sin renovar).
`renovar(hashPresentado, ahora)` devuelve `ROTADA`, `REUTILIZADA` (anterior, > 10 s),
`CARRERA` (anterior, ≤ 10 s), `VENCIDA`, `INACTIVA` o `DESCONOCIDA`.

## 3. Datos fuera de PostgreSQL (Redis)

| Clave | Valor | TTL | Uso |
|---|---|---|---|
| `lim:fallos:correo:<hmac hex>` | contador | 15 min desde el primer fallo | FR-006 |
| `lim:fallos:ip:<ip>` | contador | 15 min | FR-007 |
| `lim:envios:usuario:<usuarioId>` | contador | 15 min | FR-002a |
| `seg:version:<usuarioId>` | `version_seguridad` | 60 s | FR-011, FR-015 (research §R-07) |
| `dev:otp:<usuarioId>` | último código en claro | 300 s | Solo con `ENVIO_OTP=simulado` (FR-031) |

## 4. Transiciones relevantes (casos de uso)

| Caso de uso | Lee | Escribe (en una transacción) | Después del `COMMIT` |
|---|---|---|---|
| `IniciarSesion` (paso 1) | usuario por `correo_hmac` | `codigo_otp` nuevo; vence los anteriores | `EnviadorOTP.enviar`; contadores |
| `VerificarOtp` (paso 2) | `codigo_otp` | `codigo_otp.usado_en` o `intentos+1`; `sesion` nueva | contadores si falla |
| `RenovarSesion` | `sesion` | rotación o revocación de todas (reutilización) | — |
| `CerrarSesion` | `sesion` | `revocada_en` | — |
| `CambiarClave` | usuario | `clave_hash`, `debe_cambiar_clave=false`, `version_seguridad+1`, revoca las otras sesiones | versión en Redis |
| `CrearUsuario` | `correo_hmac` (único) | `usuario` + `usuario_rol` | — |
| `ActualizarUsuario` | usuario (+ admins bloqueados si desactiva) | nombre, celular, `activo`; si desactiva: `version_seguridad+1` y revoca sesiones | versión en Redis |
| `ReemplazarRoles` | usuario (+ admins bloqueados si quita ADMINISTRADOR) | retira/crea `usuario_rol`; `version_seguridad+1` | versión en Redis |
| `AsignarClaveTemporal` | usuario | `clave_hash`, `debe_cambiar_clave=true`, `version_seguridad+1`, revoca sesiones | versión en Redis |
| `CrearPrimerAdministrador` | admins activos | usuario + rol `ADMINISTRADOR` (si no hay ninguno) | — |
