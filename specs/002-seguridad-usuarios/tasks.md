---
description: "Lista de tareas de la funcionalidad 002: Seguridad y usuarios del personal municipal"
---

# Tareas: Seguridad y usuarios del personal municipal

**Entrada**: documentos de diseño de `specs/002-seguridad-usuarios/`

**Prerrequisitos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: incluidas. Las exige la constitución (principio V) y la especificación (SC-002 a SC-007,
EQ-04). En cada historia, las pruebas se escriben primero y deben fallar antes de implementar.

**Organización**: tareas agrupadas por historia de usuario en el orden de la especificación (US1, US2
y US3 son P1; US4 y US5 son P2). Cada historia se puede probar sola: las pruebas de integración crean
sus usuarios con el apoyo de la fase 2, sin depender de la gestión de usuarios (US5) ni del comando de
instalación (US3).

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[USn]**: historia de usuario de `spec.md` a la que pertenece la tarea.
- Rutas relativas a la raíz del repositorio. `seguridad/` abrevia `apps/api/src/modulos/seguridad/`
  y `test-seg/` abrevia `apps/api/test/unit/modulos/seguridad/`.

## Convenciones para todas las tareas

- TypeScript `strict`, sin `any`; nombres del dominio en español (principio IV).
- `seguridad/dominio/` y `seguridad/aplicacion/` no importan paquetes npm ni módulos `node:*` (la
  regla `aplicacion-hacia-dentro` incluye `core`): criptografía, tiempo, Redis, JWT y logs van detrás
  de los puertos de research.md §R-01. El cableado se hace en `seguridad/seguridad.module.ts` con
  `useFactory`, como en `catalogo.module.ts`.
- Ningún log, respuesta, URL ni mensaje de error incluye correo, nombre, celular, clave, código,
  token ni IP (FR-029, research.md §R-17). Los objetos de valor lanzan `ErrorDominio` con mensajes
  que no repiten el valor recibido.
- Cada respuesta HTTP de las pruebas de integración se valida con `esperarCumpleContrato`
  (`apps/api/test/apoyo/validarContrato.ts`).
- Los errores HTTP de este módulo usan los `type` de
  [contracts/openapi-cambios.md §4](./contracts/openapi-cambios.md) mediante `ErrorProblema` (T015).

---

## Fase 1: Preparación (dependencias y configuración)

**Propósito**: agregar dependencias y variables de entorno sin cambiar comportamiento.

- [X] T001 Agregar dependencias de la API en `apps/api/package.json`: `argon2`, `@nestjs/jwt`, `cookie-parser` y, en devDependencies, `@types/cookie-parser`; agregar el script `"crear-administrador": "node dist/modulos/seguridad/presentacion/cli/crear-administrador.js"`; ejecutar `npm install` y confirmar que `docker compose -f infra/docker-compose.yml build api` termina bien con `argon2` en `node:24-alpine` (si no hay binario precompilado para musl, agregar `python3 make g++` solo en la etapa de build de `apps/api/Dockerfile`; research.md §R-02)
- [X] T002 [P] Agregar `react-router` (7.x) a `apps/web/package.json` y ejecutar `npm install`
- [X] T003 [P] Agregar a `.env.example` las variables de research.md §R-16 con valores ficticios y un comentario "solo desarrollo": `NODE_ENV=development`, `JWT_SECRETO` (≥ 32 bytes), `CLAVE_CIFRADO_DATOS` (base64 de exactamente 32 bytes), `CLAVE_HMAC_DATOS` (base64 de ≥ 32 bytes), `ENVIO_OTP=simulado`, `TRUST_PROXY_SALTOS=1`
- [X] T004 [P] Agregar las mismas variables al servicio `api` de `infra/docker-compose.yml` con interpolación y el mismo valor por defecto de `.env.example` (`${JWT_SECRETO:-…}`), para que el comando único siga funcionando sin crear archivos
- [X] T005 [P] Agregar las variables de T003 con sus valores de ejemplo al bloque `env` de los jobs `pruebas` y `cobertura` en `.github/workflows/ci.yml` (sin cambiar el nombre de ningún job)
- [X] T006 Ejecutar `docker run --rm -v "${PWD}:/repo" zricethezav/gitleaks:latest detect --source /repo --no-banner`; si marca los valores de ejemplo de T003–T005, crear `.gitleaks.toml` que extienda la configuración por defecto (`[extend] useDefault = true`) y permita solo esos valores literales con un comentario que diga que son ficticios de desarrollo; repetir hasta 0 hallazgos

---

## Fase 2: Base (prerrequisitos bloqueantes)

**Propósito**: contrato, migración, configuración, errores, objetos de valor, adaptadores comunes,
token de acceso y apoyo de pruebas que usan todas las historias.

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta terminar esta fase. T007 va antes de cualquier
código de la API (principio II) y T009 antes de cualquier código que lea las tablas de seguridad
(principio III).

### Contrato primero

- [X] T007 Modificar `docs/06-contrato-api/openapi.yaml` exactamente según [contracts/openapi-cambios.md](./contracts/openapi-cambios.md): operaciones nuevas `cambiarClave` (`POST /auth/cambiar-clave`), `asignarClaveTemporal` (`POST /usuarios/{usuarioId}/clave-temporal`) y `buscarUsuarios` (`POST /usuarios/busqueda`); cambios en `iniciarSesion`, `verificarOtpPersonal`, `renovarSesion` (sin cuerpo, `securityScheme` `cookieRefresh` `type: apiKey, in: cookie, name: refresh_personal`), `cerrarSesion` (`security: [{ cookieRefresh: [] }]`, siempre 204), `crearUsuario`, `actualizarUsuario` y `asignarRoles`; esquemas `SesionPersonal` (sin `refreshToken`, con `debeCambiarClave`), `Usuario` (+ `celularEnmascarado`, + `debeCambiarClave`), `NuevoUsuario` (+ `claveTemporal`), nuevos `Clave` (`minLength: 12`, `maxLength: 128`, `pattern: '^(?=.*[A-Za-z])(?=.*[0-9]).+$'`), `CambioClave` y `BusquedaUsuarios` (`porPagina` `maximum: 100`, `default: 20`); `CredencialesPersonal.clave` con `minLength: 1`; cabecera `Set-Cookie` documentada en las respuestas que la emiten; descripción nueva de `DemasiadosIntentos`; ejecutar `npm run contrato` hasta 0 errores
- [X] T008 [P] Actualizar `docs/06-contrato-api/README.md`: agregar `cambiarClave`, `asignarClaveTemporal` y `buscarUsuarios` a la fila de Seguridad y Usuarios de "Operaciones por módulo" (y el total de operaciones del encabezado); explicar la cookie `refresh_personal` en "Tres tipos de token"; en "Convenciones > Datos personales" indicar que las búsquedas por nombre o correo usan `POST` con cuerpo; agregar la tabla de tipos de problema de [contracts/openapi-cambios.md §4](./contracts/openapi-cambios.md)

### Modelo de datos (migración 0003)

- [X] T009 Crear `apps/api/prisma/migrations/0003_seguridad_usuarios/migration.sql` según [data-model.md §1](./data-model.md): guarda inicial `DO $$ BEGIN IF EXISTS (SELECT 1 FROM seguridad.usuario) THEN RAISE EXCEPTION 'La migración 0003 cifra el correo y requiere que seguridad.usuario esté vacía'; END IF; END $$;`; en `usuario`: eliminar `correo`, agregar `correo_cifrado bytea NOT NULL`, `correo_hmac bytea NOT NULL UNIQUE`, `debe_cambiar_clave boolean NOT NULL DEFAULT false`, `version_seguridad integer NOT NULL DEFAULT 1 CHECK (version_seguridad > 0)`; en `usuario_rol`: quitar la PK `(usuario_id, rol_codigo)`, agregar `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `retirado_por uuid NULL`, `retirado_en timestamptz NULL`, `CHECK ((retirado_por IS NULL) = (retirado_en IS NULL))`, índice único parcial `ux_usuario_rol_vigente (usuario_id, rol_codigo) WHERE retirado_en IS NULL` e índice `ix_usuario_rol_admin_vigente (rol_codigo) WHERE retirado_en IS NULL`; en `sesion`: eliminar `vence_en`, agregar `vence_maximo_en timestamptz NOT NULL`, `ultima_actividad_en timestamptz NOT NULL DEFAULT now()`, `refresh_anterior_hash varchar(255) NULL`, `rotada_en timestamptz NULL` e índice `ix_sesion_usuario_vigente (usuario_id) WHERE revocada_en IS NULL`; con comentarios en español que citen FR y research
- [X] T010 [P] Actualizar `docs/05-modelo-de-datos/esquema.sql` para que describa el estado actual: las tablas `seguridad.usuario`, `seguridad.usuario_rol` y `seguridad.sesion` con las columnas, restricciones e índices de T009 escritos dentro de sus `CREATE TABLE`/`CREATE INDEX` (sin `ALTER`), y el comentario de cabecera que diga que el archivo refleja el estado después de todas las migraciones (research.md §R-15)
- [X] T011 [P] Actualizar `docs/05-modelo-de-datos/modelo-entidad-relacion.md`: en el diagrama Mermaid, los atributos de `USUARIO`, `USUARIO_ROL` y `SESION`; en el diccionario del esquema `seguridad`, `usuario` ("`correo_cifrado` + `correo_hmac` único (MD3); `debe_cambiar_clave` para la clave temporal; `version_seguridad` para revocar al instante"), `usuario_rol` ("historial: `id` propio, `retirado_por`/`retirado_en`; un rol vigente por usuario con índice único parcial") y `sesion` ("`vence_maximo_en` (8 h), `ultima_actividad_en` (30 min), rotación con `refresh_anterior_hash`/`rotada_en`")
- [X] T012 Reemplazar `apps/api/test/unit/migraciones.spec.ts`: quitar el par `0001 == esquema.sql`; agregar una prueba que fije el SHA-256 de `prisma/migrations/0001_esquema_inicial/migration.sql` (normalizando `\r\n` a `\n`) con el mensaje "0001 ya está aplicada: no se edita; cree una migración nueva"; mantener `0002 == docs/05-modelo-de-datos/datos-semilla.sql`
- [X] T013 Crear la prueba de integración `apps/api/test/integracion/esquema-equivalente.e2e-spec.ts` (research.md §R-15): con la conexión de `DATABASE_URL`, crear una base temporal `licencias_ref_<aleatorio>`, ejecutar en ella `docs/05-modelo-de-datos/esquema.sql` y `datos-semilla.sql`, y comparar con la base migrada, para los esquemas del módulo (`comun`, `seguridad`, `catalogo`, `tramites`, `pagos`, `inspecciones`, `licencias`, `plazos`, `notificaciones`), columnas (`information_schema.columns`: tabla, columna, tipo, nulabilidad, default), restricciones (`pg_get_constraintdef` por tabla y nombre) e índices (`pg_indexes.indexdef` con el nombre de la base quitado); el mensaje de fallo nombra el objeto distinto; borrar la base temporal en `afterAll`
- [X] T014 Aplicar la migración en una base local (`npx prisma migrate deploy` en `apps/api`), regenerar `apps/api/prisma/schema.prisma` con `npx prisma db pull` conservando los nombres de modelo y `@@map` existentes de la 001, ejecutar `npx prisma generate` y comprobar que `npm run typecheck` y T012–T013 pasan

### Configuración, errores y aplicación

- [X] T015 [P] Crear `apps/api/src/compartido/presentacion/error-problema.ts` con `ErrorProblema extends Error` (`tipo` = sufijo de `https://licencias.example.pe/errores/`, `status`, `titulo`, `reintentarEnSegundos?`) y fábricas para los tipos de [contracts/openapi-cambios.md §4](./contracts/openapi-cambios.md) (`noAutenticado`, `sinPermiso`, `debeCambiarClave`, `demasiadosIntentos(segundos)`, `ultimoAdministrador`, `correoEnUso`, `servicioNoDisponible`); extender `apps/api/src/compartido/presentacion/filtro-problema.ts` para responder esos problemas con su `type`, `title` y `status`, y agregar la cabecera `Retry-After` cuando hay `reintentarEnSegundos`; ampliar `apps/api/test/unit/compartido/filtro-problema.spec.ts` (tipo, título, estado, `Retry-After`, sin `detail` con datos internos)
- [X] T016 [P] Ampliar `apps/api/src/compartido/infraestructura/configuracion.ts` con las variables de research.md §R-16 (`NODE_ENV` ∈ `development|test|production`, por defecto `development`; `JWT_SECRETO` ≥ 32 bytes; `CLAVE_CIFRADO_DATOS` base64 de exactamente 32 bytes; `CLAVE_HMAC_DATOS` base64 de ≥ 32 bytes; `ENVIO_OTP` ∈ `simulado|sms`, por defecto `simulado`; `TRUST_PROXY_SALTOS` entero ≥ 0, por defecto 1) y reglas: con `NODE_ENV=production`, rechazar `ENVIO_OTP=simulado` (FR-031) y cualquier clave igual a su valor de `.env.example`; rechazar `ENVIO_OTP=sms` con el mensaje "No hay proveedor de SMS configurado"; los errores nombran la variable y nunca el valor; ampliar `apps/api/test/unit/compartido/configuracion.spec.ts` con cada regla (incluida la de que el mensaje no contiene el valor)
- [X] T017 Modificar `apps/api/src/configurar-aplicacion.ts`: `app.set('trust proxy', configuracion.trustProxySaltos)` (obteniendo la configuración con `app.get(CONFIGURACION)`) y `app.use(cookieParser())`; verificar que las pruebas de integración de la 001 (`salud`, `catalogo`) siguen pasando

### Dominio y puertos comunes del módulo

- [X] T018 [P] Pruebas unitarias de los objetos de valor en `test-seg/dominio/`: `correo.spec.ts` (normaliza a minúsculas y sin espacios; rechaza formatos inválidos sin repetir el valor), `celular.spec.ts` (acepta solo `^9[0-9]{8}$`; `enmascarado()` devuelve `9*****321`), `nombre-completo.spec.ts` ("3 a 150 caracteres, sin espacios al inicio o al final"), `rol.spec.ts` (los 6 códigos `MESA_PARTES`, `EVALUADOR`, `INSPECTOR`, `CAJA`, `JEFATURA`, `ADMINISTRADOR`; rechaza otros) y `politica-clave.spec.ts` (12 a 128 caracteres, al menos una letra y un número; devuelve la lista de reglas incumplidas)
- [X] T019 [P] Crear en `seguridad/dominio/` los objetos de valor y servicios que hacen pasar T018: `error-dominio.ts`, `correo.ts`, `celular.ts`, `nombre-completo.ts`, `rol.ts` (tipo `Rol` y `esRol`) y `politica-clave.ts` (`PoliticaClave.validar(texto): ReglaClaveIncumplida[]`)
- [X] T020 [P] Crear las interfaces de los puertos en `seguridad/dominio/puertos/` (research.md §R-01), con documentación breve de cada método: `repositorio-usuarios.ts`, `repositorio-sesiones.ts`, `repositorio-codigos-otp.ts`, `hasher-claves.ts` (`huella`, `verificar`, `verificarContraFicticia`), `protector-datos.ts` (`cifrar`, `descifrar`, `hmac`), `generador-secretos.ts` (`codigoOtp`, `refreshToken`, `hmacCodigo`, `sha256`), `emisor-tokens.ts` (`firmarAcceso`, `verificarAcceso` con los claims `sub`, `sid`, `roles`, `vs`, `dcc`), `limitador-intentos.ts`, `almacen-version-seguridad.ts` (`leerEstado(usuarioId, sesionId)` → versión y si la sesión está marcada como revocada, `publicarVersion`, `marcarSesionesRevocadas(sesionIds)`), `enviador-otp.ts`, `reloj.ts` y `registro-eventos-seguridad.ts` (eventos de research.md §R-17 con solo `usuarioId`/`sesionId`) — *implementado: `repositorio-sesiones.ts` y `repositorio-codigos-otp.ts` se crean en T037 junto con las entidades `Sesion` y `CodigoOtp` que usan, para no romper la compilación*
- [X] T021 Pruebas unitarias de la entidad `Usuario` en `test-seg/dominio/usuario.spec.ts`: crear con al menos un rol y `debeCambiarClave = true`; `desactivar()`/`reactivar()`; `asignarClaveTemporal(huella)` pone `debeCambiarClave = true` e incrementa `versionSeguridad`; `cambiarClave(huella)` lo pone en `false` e incrementa la versión; `reemplazarRoles(roles, porUsuarioId, en)` devuelve qué asignaciones se retiran y cuáles se crean, rechaza una lista vacía e incrementa la versión solo si hubo cambios
- [X] T022 Crear `seguridad/dominio/usuario.ts` (agregado con los campos de [data-model.md §2](./data-model.md)) y `seguridad/dominio/asignacion-rol.ts` ("Ambos nulos (vigente) o ambos con valor (retirada)"; vigente → retirada es terminal) que hacen pasar T021

### Adaptadores comunes

- [X] T023 [P] Prueba y adaptador `ProtectorDatosAesGcm`: `test-seg/infraestructura/protector-datos-aes-gcm.spec.ts` (cifrar y descifrar ida y vuelta; dos cifrados del mismo texto difieren por el IV; un texto alterado falla al descifrar; `hmac` es determinista y distinto con otra clave) y `seguridad/infraestructura/protector-datos-aes-gcm.ts` (AES-256-GCM, IV aleatorio de 12 bytes, formato `iv ‖ tag ‖ texto`; HMAC-SHA256 con `CLAVE_HMAC_DATOS`; research.md §R-04)
- [X] T024 [P] Prueba y adaptador `HasherClavesArgon2`: `test-seg/infraestructura/hasher-claves-argon2.spec.ts` (la huella empieza con `$argon2id$`; verifica la clave correcta y rechaza otra; `verificarContraFicticia` siempre devuelve `false`) y `seguridad/infraestructura/hasher-claves-argon2.ts` (research.md §R-02)
- [X] T025 [P] Prueba y adaptador `GeneradorSecretosCrypto`: `test-seg/infraestructura/generador-secretos-crypto.spec.ts` (código de exactamente 6 dígitos con ceros a la izquierda; refresh `<sesionId>.<base64url de 32 bytes>`; `hmacCodigo` depende del `desafioId`; comparación en tiempo constante) y `seguridad/infraestructura/generador-secretos-crypto.ts` (`randomInt(0, 1_000_000)`, `randomBytes`, `timingSafeEqual`; research.md §R-03)
- [X] T026 [P] Crear `seguridad/infraestructura/reloj-sistema.ts` y `seguridad/infraestructura/registro-eventos-seguridad-logger.ts` (usa `Logger` de NestJS con contexto `Seguridad`; escribe solo el nombre del evento y `usuarioId`/`sesionId`), con una prueba en `test-seg/infraestructura/registro-eventos-seguridad-logger.spec.ts` que verifique el formato de la línea
- [X] T027 Prueba y adaptador `RepositorioUsuariosPostgres` (parte común): `apps/api/test/integracion/repositorio-usuarios.e2e-spec.ts` (guardar y leer por id y por `correo_hmac`; el correo y el celular quedan cifrados en la base; leer roles vigentes ignorando los retirados) y `seguridad/infraestructura/repositorio-usuarios-postgres.ts` con `crear`, `obtenerPorId`, `obtenerPorCorreo` (el adaptador calcula el HMAC del correo normalizado) y `guardar` (usa `ProtectorDatos` para cifrar/descifrar; nunca registra valores)
- [X] T028 [P] Prueba y adaptador `EmisorTokensJwt`: `test-seg/infraestructura/emisor-tokens-jwt.spec.ts` (firma y verifica los claims `sub`, `sid`, `roles`, `vs`, `dcc`; rechaza firma alterada y token vencido; 15 minutos de vida; el token no contiene correo ni nombre) y `seguridad/infraestructura/emisor-tokens-jwt.ts` con `@nestjs/jwt` HS256 y `JWT_SECRETO` (research.md §R-05)
- [X] T029 Prueba unitaria y `JwtAuthGuard` básico: `test-seg/presentacion/jwt-auth.guard.spec.ts` (sin `Authorization`, formato distinto de `Bearer`, firma inválida o vencido → `ErrorProblema` 401 `no-autenticado`; `dcc = true` → 403 `debe-cambiar-clave` salvo en rutas marcadas con el decorador `@PermitirConClaveTemporal()`; válido → deja `{ usuarioId, sesionId, roles }` en la petición) y `seguridad/presentacion/jwt-auth.guard.ts` + `seguridad/presentacion/decoradores.ts` (`PermitirConClaveTemporal`); la comprobación de la versión de seguridad se agrega en US2 (T048)
- [X] T030 Crear `seguridad/seguridad.module.ts` (`@Global()`) con el cableado `useFactory` de los adaptadores de T023–T028 y el guard de T029, e importarlo en `apps/api/src/app.module.ts`; crear `seguridad/fachada.ts` exportando por ahora `JwtAuthGuard` y el tipo `Rol`

### Apoyo de pruebas de integración

- [X] T031 Crear el apoyo de pruebas en `apps/api/test/apoyo/`: `aplicacion-prueba.ts` (crea la app de Nest con `configurarAplicacion` y un logger que acumula las líneas en memoria, expuesto para T075), `usuarios-prueba.ts` (`crearUsuarioDePrueba({ roles, activo, debeCambiarClave, clave })` usando `RepositorioUsuariosPostgres` y `HasherClavesArgon2`, con correos y celulares ficticios únicos), `redis-prueba.ts` (`leerOtpSimulado(usuarioId)` desde `dev:otp:<usuarioId>` y `limpiarClavesSeguridad()` que borra `lim:*`, `seg:*` y `dev:otp:*`), y `limpiar-seguridad.ts` (borra `sesion`, `codigo_otp`, `usuario_rol` y `usuario` entre pruebas)

**Punto de control**: contrato y migración aplicados, `npm run typecheck`, `npm run contrato` y las
pruebas de la fase pasan; la API arranca con las variables nuevas.

---

## Fase 3: Historia de usuario 1 – Iniciar sesión en dos pasos (Prioridad: P1) 🎯 MVP

**Objetivo**: el personal entra con correo, clave y código de 6 dígitos; la sesión se renueva (máximo
8 h, cierre tras 30 min sin actividad), se cierra y detecta la reutilización del refresh token; con
clave temporal, el usuario debe cambiarla antes de cualquier otra operación.

**Prueba independiente**: con un usuario creado por `crearUsuarioDePrueba`, recorrer
[quickstart.md](./quickstart.md) §2 y §3 o ejecutar `autenticacion.e2e-spec.ts`.

### Pruebas de la historia 1 (escribir primero; deben fallar)

- [X] T032 [P] [US1] Pruebas unitarias de `CodigoOtp` en `test-seg/dominio/codigo-otp.spec.ts`: "Creación + 5 min" de vencimiento; `verificar(codigo, ahora)` devuelve `CORRECTO`, `INCORRECTO`, `VENCIDO` o `AGOTADO`; `intentos` "0 a 5" (el 5.º fallo deja el código `AGOTADO`); un código usado no vuelve a servir
- [X] T033 [P] [US1] Pruebas unitarias de `Sesion` en `test-seg/dominio/sesion.spec.ts`: `venceMaximoEn = creadaEn + 8 h`; `renovar(hashPresentado, ahora)` devuelve `ROTADA` (y mueve el hash vigente a `refreshAnteriorHash` con `rotadaEn`), `REUTILIZADA` (anterior, > 10 s), `CARRERA` (anterior, ≤ 10 s), `VENCIDA` (≥ 8 h), `INACTIVA` (> 30 min desde `ultimaActividadEn`) o `DESCONOCIDA`; una sesión revocada nunca renueva
- [X] T034 [P] [US1] Pruebas unitarias de los casos de uso con dobles de los puertos en `test-seg/aplicacion/`: `iniciar-sesion.spec.ts` (credenciales correctas → crea código, vence los anteriores, llama a `EnviadorOTP` y devuelve `desafioId`, `venceEn` y celular enmascarado; correo inexistente → verifica contra la huella ficticia y lanza no autenticado; usuario inactivo o clave incorrecta → mismo error), `verificar-otp.spec.ts` (correcto → sesión con `venceMaximoEn` y token con `dcc` del usuario; incorrecto → `intentos+1`; vencido/agotado/usado/inexistente → no autenticado; usuario desactivado entre pasos → no autenticado), `renovar-sesion.spec.ts` (cada resultado de T033; `REUTILIZADA` revoca todas las sesiones del usuario y registra `reutilizacion-refresh`), `cerrar-sesion.spec.ts` (revoca y, después de guardar, llama a `AlmacenVersionSeguridad.marcarSesionesRevocadas([sid])`; sin sesión no falla) y `cambiar-clave.spec.ts` (clave actual incorrecta → no autenticado; nueva que no cumple la política o igual a la actual → error con las reglas; éxito → huella nueva, `debeCambiarClave = false`, versión + 1, revoca las demás sesiones, rota la actual); en todos, los casos de uso reciben solo puertos (dobles de prueba, nunca adaptadores), lo que demuestra que cambiar `EnviadorOtpSimulado` por un proveedor real no toca sus reglas (SC-011)
- [X] T035 [P] [US1] Prueba de integración `apps/api/test/integracion/autenticacion.e2e-spec.ts` (PostgreSQL y Redis reales, OTP leído con `leerOtpSimulado`): flujo completo de [contracts/autenticacion.md](./contracts/autenticacion.md); `Set-Cookie` con `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/api/v1/auth`; cuerpo sin `refreshToken`; mismo cuerpo 401 para correo inexistente, clave incorrecta, código incorrecto y usuario inactivo; código vencido y código usado → 401 (los vencimientos del código y de la sesión usan el `Reloj` inyectado, que la prueba reemplaza por uno controlable; el vencimiento del token de acceso lo firma `@nestjs/jwt` con la hora real y se prueba en T028, no aquí); renovar rota la cookie; reutilizar la cookie anterior pasados 10 s → 401 y la vigente también deja de servir; cerrar sesión → 204 y renovar después → 401 (que el token de acceso de una sesión cerrada responda 401 aunque no haya vencido se comprueba en T047, porque el guard consulta las sesiones revocadas desde T048, en US2); con clave temporal, `GET /usuarios` → 403 `debe-cambiar-clave` y `POST /auth/cambiar-clave` → 200 con `debeCambiarClave: false`; más de 30 min desde la última renovación (avanzando el `Reloj`) → 401; todas las respuestas validadas contra el contrato
- [ ] T036 [P] [US1] Pruebas del portal con `fetch` simulado: `apps/web/src/paginas/Ingresar.test.tsx` (paso 1 → paso 2 con "Enviamos un código al celular 9*****321"; 401 muestra "Correo, clave o código incorrectos."; 429 muestra la hora de reintento calculada con `Retry-After`; 503 su mensaje; "Enviar otro código" repite el paso 1; con `debeCambiarClave` navega a `/cambiar-clave`), `apps/web/src/paginas/CambiarClave.test.tsx` (las dos claves nuevas deben coincidir; muestra los errores del 422 junto al campo; al terminar va a `/` con "Su clave se cambió") y `apps/web/src/sesion/ProveedorSesion.test.tsx` (al montar llama a `/auth/renovar`; ante un 401 renueva una vez y reintenta; 30 min sin actividad cierran la sesión con "Su sesión se cerró por inactividad"; el token nunca se escribe en `localStorage` ni `sessionStorage`)

### Implementación de la historia 1

- [X] T037 [P] [US1] Crear `seguridad/dominio/codigo-otp.ts` y `seguridad/dominio/sesion.ts` que hacen pasar T032 y T033 (estados y reglas de [data-model.md §2](./data-model.md))
- [X] T038 [P] [US1] Crear `seguridad/infraestructura/repositorio-codigos-otp-postgres.ts` (crear, obtener por id, `registrarIntento`, `marcarUsado`, `vencerVigentesDelUsuario` con `vence_en = now()`; propósito `INICIO_SESION`) y `seguridad/infraestructura/repositorio-sesiones-postgres.ts` (crear, obtener por id, `guardar` tras rotar, `revocar`, `revocarTodasDelUsuario`, `revocarTodasMenos(sesionId)`), con pruebas en `apps/api/test/integracion/repositorios-sesion-otp.e2e-spec.ts`
- [X] T039 [P] [US1] Crear `seguridad/infraestructura/enviador-otp-simulado.ts`: guarda el código en Redis con `SET dev:otp:<usuarioId> <codigo> EX 300`, sin log ni endpoint (research.md §R-11), con prueba en `test-seg/infraestructura/enviador-otp-simulado.spec.ts` (Redis falso: clave, valor y TTL)
- [X] T040 [US1] Crear los casos de uso en `seguridad/aplicacion/`: `iniciar-sesion.ts`, `verificar-otp.ts`, `renovar-sesion.ts`, `cerrar-sesion.ts` y `cambiar-clave.ts`, que hacen pasar T034; registran los eventos `inicio-sesion-exitoso`, `inicio-sesion-fallido`, `reutilizacion-refresh` y `clave-cambiada` con `RegistroEventosSeguridad`; `CerrarSesion`, `RenovarSesion` (al detectar reutilización) y `CambiarClave` (las demás sesiones) marcan los `sid` revocados con `AlmacenVersionSeguridad.marcarSesionesRevocadas` después del `COMMIT` (el adaptador Redis y la consulta de esas marcas en el guard llegan en T048; hasta entonces el módulo cablea un almacén en memoria que solo guarda las marcas); los límites de intentos se agregan en US4 (T061)
- [X] T041 [US1] Crear `seguridad/presentacion/auth.controller.ts` con `POST auth/iniciar-sesion`, `auth/verificar-otp`, `auth/renovar`, `auth/cerrar-sesion` y `auth/cambiar-clave` (este último con `JwtAuthGuard` y `@PermitirConClaveTemporal()`): valida el cuerpo según el contrato (422 con `ErrorValidacion`), emite y borra la cookie `refresh_personal` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`, `Max-Age` = segundos hasta `venceMaximoEn`), convierte los resultados en `SesionPersonal`/`DesafioOtp` y los errores en `ErrorProblema`; cablear casos de uso y controlador en `seguridad/seguridad.module.ts`
- [ ] T042 [P] [US1] Crear en el portal `apps/web/src/sesion/ProveedorSesion.tsx` (contexto con token en memoria y usuario actual; al montar llama a `/auth/renovar`; renueva a los 13 min si hubo actividad en los últimos 30 min; cierra tras 30 min sin actividad; serializa las renovaciones con `navigator.locks.request('renovar-sesion', …)` con alternativa sin bloqueo si el navegador no lo soporta) y `apps/web/src/sesion/actividad.ts` (escucha `keydown`, `pointerdown`, `click`)
- [ ] T043 [US1] Modificar `apps/web/src/servicios/clienteApi.ts`: middleware de `openapi-fetch` que agrega `Authorization: Bearer` desde `ProveedorSesion` y, ante un 401, renueva una vez y reintenta; funciones `iniciarSesion`, `verificarOtp`, `renovar`, `cerrarSesion` y `cambiarClave` tipadas con `@licencias/contracts` (regenerar con `npm run generar`), con `credentials: 'same-origin'` para enviar la cookie
- [ ] T044 [US1] Crear `apps/web/src/componentes/RutaProtegida.tsx` (sin sesión → `/ingresar`; con `debeCambiarClave` → `/cambiar-clave`) y `apps/web/src/componentes/CampoFormulario.tsx` (`label`, `aria-describedby` para el error, foco visible); modificar `apps/web/src/main.tsx` para usar `react-router` con `/` (Inicio de la 001), `/ingresar` y `/cambiar-clave` dentro de `ProveedorSesion`
- [ ] T045 [US1] Crear `apps/web/src/paginas/Ingresar.tsx` y `apps/web/src/paginas/CambiarClave.tsx` según [contracts/portal-seguridad.md](./contracts/portal-seguridad.md) (`autocomplete` `username`/`current-password`/`one-time-code`/`new-password`, `inputmode="numeric"`, mensajes con `role="alert"`, la clave y el código se borran del estado al terminar o al volver), con estilos primero celular en `apps/web/src/estilos/global.css`, que hacen pasar T036

**Punto de control**: T032–T036 pasan; quickstart §2 y §3 funcionan contra Docker Compose.

---

## Fase 4: Historia de usuario 2 – Control de permisos por rol (Prioridad: P1)

**Objetivo**: cualquier módulo protege una operación con `@RequiereRoles(...)`; sin sesión válida →
401, rol insuficiente → 403, sin modificar datos; desactivar o quitar un rol vale desde la siguiente
operación (research.md §R-07).

**Prueba independiente**: `control-permisos.e2e-spec.ts` con un controlador de prueba
`@RequiereRoles('CAJA')` (historia 2, escenarios 1 a 5).

### Pruebas de la historia 2 (escribir primero; deben fallar)

- [ ] T046 [P] [US2] Pruebas unitarias en `test-seg/presentacion/roles.guard.spec.ts` (sin roles declarados → permite; con al menos un rol admitido → permite; ninguno → 403 `sin-permiso`; usa los roles que dejó `JwtAuthGuard`) y en `test-seg/aplicacion/resolver-usuario-autenticado.spec.ts` (versión de Redis igual a `vs` → roles del token sin consultar el repositorio; distinta → consulta el usuario: inactivo → no autenticado, activo → roles vigentes y `debeCambiarClave` actuales; Redis falla o no tiene la clave → lee `version_seguridad` y `sesion.revocada_en` del repositorio y vuelve a publicar la versión; sesión marcada como revocada en Redis o con `revocada_en` en PostgreSQL → no autenticado, aunque la versión coincida)
- [ ] T047 [P] [US2] Prueba de integración `apps/api/test/integracion/control-permisos.e2e-spec.ts`: monta un controlador de prueba con `@Get('prueba/caja') @RequiereRoles('CAJA')` y `@Get('prueba/jefatura') @RequiereRoles('JEFATURA')`; verifica 401 sin token, con token alterado y con el token de una sesión cerrada con `POST /auth/cerrar-sesion` aunque no haya vencido (FR-004, FR-013); 403 con `EVALUADOR`; 200 con `CAJA`; 200 en `prueba/jefatura` con `EVALUADOR + JEFATURA`; tras desactivar al usuario (apoyo: `activo = false`, `version_seguridad + 1` y publicar la versión) la siguiente petición → 401; tras quitarle `CAJA` (retirar la asignación y subir la versión) → 403 sin volver a iniciar sesión; con Redis detenido a mitad de la prueba (cliente desconectado) el control sigue funcionando con PostgreSQL

### Implementación de la historia 2

- [ ] T048 [US2] Crear `seguridad/infraestructura/almacen-version-seguridad-redis.ts` (`leerEstado` con un solo `MGET seg:version:<usuarioId> seg:sesion-revocada:<sesionId>`; `publicarVersion` con `SET seg:version:<usuarioId> EX 60`; `marcarSesionesRevocadas` con `SET seg:sesion-revocada:<sid> 1 EX 900` en un pipeline; devuelve "desconocido" si Redis falla y registra el fallo de escritura como evento; research.md §R-07), con su prueba unitaria `test-seg/infraestructura/almacen-version-seguridad-redis.spec.ts` (Redis falso: un solo `MGET` con las dos claves, `EX 60` para la versión, `EX 900` para cada sesión revocada en un pipeline, "desconocido" y evento registrado cuando Redis falla); reemplazar con él el almacén en memoria de T040, y `seguridad/aplicacion/resolver-usuario-autenticado.ts`, que hacen pasar T046; agregar a `RepositorioUsuariosPostgres` `obtenerEstadoSeguridad(usuarioId, sesionId)` (`activo`, `version_seguridad`, roles vigentes, `debe_cambiar_clave` y si la sesión tiene `revocada_en`); modificar `seguridad/presentacion/jwt-auth.guard.ts` para usar `ResolverUsuarioAutenticado` después de verificar el token
- [ ] T049 [US2] Crear `seguridad/presentacion/roles.guard.ts` y completar `seguridad/presentacion/decoradores.ts` con `Roles(...roles)`, `RequiereRoles(...roles)` (`applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(...roles))`) y `UsuarioActual()` (devuelve `{ usuarioId, roles }`); exportarlos desde `seguridad/fachada.ts` junto con `UsuarioAutenticado` (sin `PermitirConClaveTemporal`, que es interno, ni clases de consulta), según [contracts/control-permisos.md](./contracts/control-permisos.md); cablearlos en `seguridad/seguridad.module.ts`
- [ ] T050 [US2] Hacer que cada caso de uso que incrementa `version_seguridad` publique la versión nueva con `AlmacenVersionSeguridad.publicarVersion` después del `COMMIT` (en esta historia: `CambiarClave` de T040); agregar el caso a `cambiar-clave.spec.ts` y comprobar en `control-permisos.e2e-spec.ts` que las marcas de sesión revocada de T040 llegan a Redis
- [ ] T051 [P] [US2] Crear `apps/web/src/componentes/Menu.tsx` (muestra solo las opciones de los roles del usuario: "Usuarios" para `ADMINISTRADOR`; botón "Cerrar sesión" que llama a `cerrarSesion` y vuelve a `/ingresar`) con `apps/web/src/componentes/Menu.test.tsx` (sin sesión no muestra opciones privadas; `ADMINISTRADOR` ve "Usuarios"; `CAJA` no), e incluirlo en el diseño principal de `apps/web/src/main.tsx`

**Punto de control**: T046–T047 pasan; `npm run regla-dependencia` sigue sin violaciones (otros
módulos solo pueden importar `seguridad/fachada.ts`).

---

## Fase 5: Historia de usuario 3 – Primer administrador al instalar (Prioridad: P1)

**Objetivo**: `npm run crear-administrador` crea el primer administrador sin claves en el repositorio
y no hace nada si ya existe uno.

**Prueba independiente**: [quickstart.md](./quickstart.md) §1 o `crear-administrador.e2e-spec.ts`.

### Pruebas de la historia 3 (escribir primero; deben fallar)

- [ ] T052 [P] [US3] Prueba unitaria `test-seg/aplicacion/crear-primer-administrador.spec.ts`: sin administradores activos → crea un usuario activo con `ADMINISTRADOR` vigente, `debeCambiarClave = true` y `asignadoPor` = su propio id; con un administrador activo → no crea ni modifica nada y devuelve `YA_EXISTE`; correo ya usado → `CORREO_EN_USO`; clave que no cumple la política → error con las reglas
- [ ] T053 [P] [US3] Prueba de integración `apps/api/test/integracion/crear-administrador.e2e-spec.ts`: invoca la función principal del comando con `ADMIN_CORREO`, `ADMIN_NOMBRE`, `ADMIN_CELULAR` y `ADMIN_CLAVE` ficticios y salida capturada; verifica el texto `Administrador creado. Id: <uuid>. Deberá cambiar la clave en su primer ingreso.`, código 0, que el usuario puede iniciar sesión con el OTP simulado y que una segunda ejecución imprime `Ya existe un administrador activo; no se hizo ningún cambio.` sin cambiar el número de usuarios ni de asignaciones; sin terminal y con variables faltantes → código 2 y "Faltan variables: ADMIN_…"; ninguna salida contiene el correo, el celular ni la clave

### Implementación de la historia 3

- [ ] T054 [US3] Crear `seguridad/aplicacion/crear-primer-administrador.ts` que hace pasar T052 (comprueba administradores activos y crea dentro de una transacción con el bloqueo de research.md §R-09, usando `RepositorioUsuarios.contarAdministradoresActivosConBloqueo`; agregar ese método a `RepositorioUsuariosPostgres`)
- [ ] T055 [US3] Crear `seguridad/presentacion/cli/crear-administrador.ts` según [contracts/crear-administrador.md](./contracts/crear-administrador.md): `NestFactory.createApplicationContext(AppModule, { logger: false })`; lee las variables `ADMIN_*` y, si faltan y `process.stdin.isTTY`, las pide con `node:readline` (la clave sin eco y dos veces); imprime solo los mensajes del contrato y termina con los códigos 0/1/2/3; exporta la función principal para T053
- [ ] T056 [US3] Agregar al `README.md` (sección "Cómo levantar el sistema") el paso "Crear el primer administrador" con el comando de Docker Compose, la advertencia de no dejar la clave en el historial de la terminal (preferir el modo interactivo) y cómo leer el código simulado en desarrollo (`redis-cli GET dev:otp:<usuarioId>`)

**Punto de control**: T052–T053 pasan; quickstart §1 funciona contra Docker Compose.

---

## Fase 6: Historia de usuario 4 – Bloqueo ante intentos fallidos (Prioridad: P2)

**Objetivo**: 5 fallos en 15 minutos (por correo y por IP) bloquean con 429 y `Retry-After`, sin
revelar qué dato falló; como máximo 3 códigos por usuario en 15 minutos; contadores compartidos.

**Prueba independiente**: [quickstart.md](./quickstart.md) §4 o `fuerza-bruta.e2e-spec.ts`.

### Pruebas de la historia 4 (escribir primero; deben fallar)

- [ ] T057 [P] [US4] Prueba unitaria `test-seg/infraestructura/limitador-intentos-redis.spec.ts` con Redis falso: `INCR` + `EXPIRE` de 900 s solo en la primera vez (en `MULTI`); claves `lim:fallos:correo:<hmac hex>`, `lim:fallos:ip:<ip>` y `lim:envios:usuario:<usuarioId>`; `estaBloqueado` con 5 fallos (o 3 envíos) y `segundosRestantes` = TTL redondeado hacia arriba; error de Redis → `NoDisponible`
- [ ] T058 [P] [US4] Ampliar las pruebas unitarias de `test-seg/aplicacion/iniciar-sesion.spec.ts`, `verificar-otp.spec.ts` y `cambiar-clave.spec.ts` con el orden de [contracts/autenticacion.md](./contracts/autenticacion.md): límites antes que credenciales; 6.º intento rechazado aunque sea correcto; correo inexistente cuenta igual; 4.º código en 15 min → 429 sin enviar SMS; Redis no disponible → 503; fallo del envío del SMS → 503 sin contar el envío; éxito no reinicia los contadores
- [ ] T059 [P] [US4] Prueba de integración `apps/api/test/integracion/fuerza-bruta.e2e-spec.ts`: 5 claves incorrectas → 401; el 6.º intento y uno con la clave correcta → 429 con `Retry-After` entre 1 y 900; lo mismo con un correo inexistente (respuestas idénticas); 5 fallos contra correos distintos desde la misma IP (cabecera `X-Forwarded-For` con `trust proxy`) → 429; fallos de código OTP suman al mismo contador; 4 pedidos de código con credenciales correctas → el 4.º 429; dos instancias de la app (dos `INestApplication` con el mismo Redis) repartiéndose los intentos → bloqueo en el 6.º total; al vencer la clave (borrándola) se puede entrar

### Implementación de la historia 4

- [ ] T060 [US4] Crear `seguridad/infraestructura/limitador-intentos-redis.ts` que hace pasar T057
- [ ] T061 [US4] Integrar `LimitadorIntentos` en `seguridad/aplicacion/iniciar-sesion.ts`, `verificar-otp.ts` y `cambiar-clave.ts` según la tabla de [contracts/autenticacion.md](./contracts/autenticacion.md), registrando `bloqueo-temporal`; en `seguridad/presentacion/auth.controller.ts` pasar la IP de `request.ip` y convertir los resultados en `ErrorProblema.demasiadosIntentos(segundos)` (429 + `Retry-After`) o `servicioNoDisponible` (503); cablear en `seguridad/seguridad.module.ts`; hacen pasar T058–T059
- [ ] T062 [P] [US4] Verificar que `apps/web/nginx.conf` reenvía `X-Forwarded-For` y `X-Real-IP` en `location /api/` (agregar `proxy_set_header X-Real-IP $remote_addr;` si falta) y documentar `TRUST_PROXY_SALTOS` en `.env.example` ("1 = solo el nginx del portal; 2 = balanceador + nginx")

**Punto de control**: T057–T059 pasan; quickstart §4 funciona.

---

## Fase 7: Historia de usuario 5 – Gestión de usuarios y roles (Prioridad: P2)

**Objetivo**: el administrador lista, busca, crea, edita, desactiva/reactiva, asigna o quita roles y
asigna claves temporales; se conserva el historial de roles y nunca queda sin administrador activo.

**Prueba independiente**: [quickstart.md](./quickstart.md) §5 a §7 o `usuarios.e2e-spec.ts`,
`matriz-permisos-usuarios.e2e-spec.ts` y `ultimo-administrador.e2e-spec.ts`.

### Pruebas de la historia 5 (escribir primero; deben fallar)

- [ ] T063 [P] [US5] Prueba unitaria `test-seg/dominio/regla-ultimo-administrador.spec.ts`: rechaza con `ErrorUltimoAdministrador` desactivar o quitar `ADMINISTRADOR` al único administrador activo (también si es el propio usuario); permite si queda al menos otro; no afecta a operaciones sobre no administradores
- [ ] T064 [P] [US5] Pruebas unitarias de los casos de uso en `test-seg/aplicacion/`: `crear-usuario.spec.ts` (correo duplicado → `correo-en-uso`; política de clave; al menos un rol; `debeCambiarClave = true`; registra `asignadoPor`/`asignadoEn`), `actualizar-usuario.spec.ts` (nombre, celular y activo; correo no editable; desactivar → versión + 1, revoca sesiones, aplica la regla del último administrador y registra `usuario-desactivado`), `reemplazar-roles.spec.ts` (retira las asignaciones que ya no están con `retiradoPor`/`retiradoEn`, crea las nuevas, versión + 1 solo si hubo cambios, regla del último administrador, registra `roles-cambiados`), `asignar-clave-temporal.spec.ts` (política; `debeCambiarClave = true`; versión + 1; revoca todas las sesiones; registra `clave-temporal-asignada`) y `listar-usuarios.spec.ts`/`buscar-usuarios.spec.ts` (paginación, filtro `activo`, texto como fragmento del nombre o correo exacto por HMAC); todos publican la versión con `AlmacenVersionSeguridad.publicarVersion` y marcan los `sid` revocados con `marcarSesionesRevocadas` después del `COMMIT`
- [ ] T065 [P] [US5] Prueba de integración `apps/api/test/integracion/usuarios.e2e-spec.ts` (como administrador): crear (201, `celularEnmascarado` `9*****321`, `debeCambiarClave: true`); correo repetido → 409 `correo-en-uso`; celular inválido → 422 sin el valor en el cuerpo; `PATCH` de nombre, celular y activo; el correo no se puede cambiar; `PUT` de roles conserva la asignación retirada en `seguridad.usuario_rol` con `retirado_por` y `retirado_en`, y volver a dar el rol crea otra fila; `POST /usuarios/busqueda` por fragmento del nombre y por correo exacto; `GET /usuarios?activo=false`; clave temporal → 204, la clave anterior deja de servir, las sesiones abiertas quedan revocadas y el siguiente ingreso exige cambiarla; ninguna URL usada contiene datos personales; todas las respuestas validadas contra el contrato
- [ ] T066 [P] [US5] Prueba de integración `apps/api/test/integracion/matriz-permisos-usuarios.e2e-spec.ts` (SC-002): para las 6 operaciones `listarUsuarios`, `buscarUsuarios`, `crearUsuario`, `actualizarUsuario`, `asignarRoles` y `asignarClaveTemporal`, sin token → 401 y con un token de cada uno de los 6 roles → 403 salvo `ADMINISTRADOR` (2xx); en cada 401/403 se comprueba que la base no cambió (conteo y `actualizado_en` de `seguridad.usuario`)
- [ ] T067 [P] [US5] Prueba de integración `apps/api/test/integracion/ultimo-administrador.e2e-spec.ts`: con un solo administrador activo, quitarse `ADMINISTRADOR` o desactivarse → 409 `ultimo-administrador`; con dos administradores, cada uno intenta en paralelo (`Promise.all`) quitarle el rol al otro → exactamente una respuesta 200 y una 409, y al final queda un administrador activo (repetir 10 veces)
- [ ] T068 [P] [US5] Pruebas del portal `apps/web/src/paginas/admin/Usuarios.test.tsx` con `fetch` simulado: lista con nombre, correo, roles y estado; búsqueda con `POST /usuarios/busqueda`; filtro "Activos / Inactivos / Todos"; alta con al menos un rol y el recordatorio de la clave temporal; 409 `correo-en-uso` junto al campo; 409 `ultimo-administrador` como alerta "Debe existir al menos un administrador activo"; editar muestra el celular enmascarado; asignar clave temporal pide confirmación; estados cargando, vacío ("No hay usuarios que coincidan") y error con "Reintentar"; un usuario sin `ADMINISTRADOR` ve "No tiene permiso para ver esta página"

### Implementación de la historia 5

- [ ] T069 [P] [US5] Crear `seguridad/dominio/regla-ultimo-administrador.ts` que hace pasar T063
- [ ] T070 [US5] Ampliar `seguridad/infraestructura/repositorio-usuarios-postgres.ts` con: `listar({ activo, pagina, porPagina })`, `buscar({ texto, activo, pagina, porPagina })` (`nombre_completo ILIKE '%texto%'` y, si el texto tiene forma de correo, `correo_hmac` = HMAC del correo normalizado), `existeCorreoHmac`, `bloquearAdministradoresActivos(tx)` con el `SELECT … FOR UPDATE OF u` de research.md §R-09, y `guardar` dentro de una transacción que retira (`UPDATE … SET retirado_por, retirado_en`) y crea asignaciones e incrementa `version_seguridad`; con casos en `apps/api/test/integracion/repositorio-usuarios.e2e-spec.ts`
- [ ] T071 [US5] Crear los casos de uso `crear-usuario.ts`, `actualizar-usuario.ts`, `reemplazar-roles.ts`, `asignar-clave-temporal.ts`, `listar-usuarios.ts` y `buscar-usuarios.ts` en `seguridad/aplicacion/` que hacen pasar T064 (desactivar y quitar `ADMINISTRADOR` corren con el bloqueo de T070 y la regla de T069; revocan sesiones con `RepositorioSesiones.revocarTodasDelUsuario`, que devuelve los `sid` revocados para marcarlos en Redis)
- [ ] T072 [US5] Crear `seguridad/presentacion/usuarios.controller.ts` con `GET usuarios`, `POST usuarios/busqueda`, `POST usuarios`, `PATCH usuarios/:usuarioId`, `PUT usuarios/:usuarioId/roles` y `POST usuarios/:usuarioId/clave-temporal`, todos con `@RequiereRoles('ADMINISTRADOR')`; validación según el contrato (422); respuesta `Usuario` con `celularEnmascarado` (nunca el celular completo) y `debeCambiarClave`; `asignadoPor`/`retiradoPor` = `@UsuarioActual().usuarioId`; errores con `ErrorProblema` (`correo-en-uso`, `ultimo-administrador`, 404); cablear en `seguridad/seguridad.module.ts`; hacen pasar T065–T067
- [ ] T073 [US5] Agregar a `apps/web/src/servicios/clienteApi.ts` las funciones `listarUsuarios`, `buscarUsuarios`, `crearUsuario`, `actualizarUsuario`, `asignarRoles` y `asignarClaveTemporal` tipadas con `@licencias/contracts`
- [ ] T074 [US5] Crear `apps/web/src/paginas/admin/Usuarios.tsx`, `apps/web/src/paginas/admin/FormularioUsuario.tsx` (alta y edición con casillas de los 6 roles) y la ruta `/admin/usuarios` protegida por `RutaProtegida` con rol `ADMINISTRADOR` en `apps/web/src/main.tsx`, según [contracts/portal-seguridad.md](./contracts/portal-seguridad.md) (tarjetas en celular, 20 por página, estados cargando/vacío/error), con estilos en `apps/web/src/estilos/global.css`; hacen pasar T068

**Punto de control**: T063–T068 pasan; quickstart §5 a §7 funcionan contra Docker Compose.

---

## Fase 8: Pulido y aspectos transversales

**Propósito**: verificaciones que abarcan varias historias.

- [ ] T075 Crear `apps/api/test/integracion/datos-personales.e2e-spec.ts` (SC-007): recorre inicio de sesión (con errores), cambio de clave, alta, edición, búsqueda, asignación de clave temporal y fuerza bruta con datos ficticios únicos, y verifica que ninguna respuesta (cuerpo y cabeceras, salvo la cookie), ninguna URL usada y ninguna línea del logger capturado (T031) contiene el correo, el nombre, el celular, la clave, el código ni el refresh token; y que en la base `correo_cifrado` y `celular_cifrado` no contienen el texto en claro y `clave_hash` empieza con `$argon2id$`
- [ ] T076 [P] Ejecutar `npm run cobertura` y agregar pruebas en `test-seg/` hasta que `seguridad/dominio` y `seguridad/aplicacion` superen el 80 % de líneas y ramas; confirmar que ninguna prueba de `test-seg/aplicacion/` importa archivos de `seguridad/infraestructura/` (SC-011)
- [ ] T077 [P] Auditar con Lighthouse móvil `http://localhost:8080/ingresar`, `/cambiar-clave` y `/admin/usuarios` (con sesión de administrador) y corregir en `apps/web/src/` hasta accesibilidad ≥ 90 y buenas prácticas ≥ 90; anotar las puntuaciones en la sección de verificación del `README.md` junto a las de la 001 (SC-010, EQ-05)
- [ ] T078 [P] Ejecutar gitleaks (como en T006) y resolver cualquier hallazgo hasta 0 (FR-023, SC-007)
- [ ] T079 Actualizar el `README.md`: variables de entorno nuevas y por qué no tienen valores reales; inicio de sesión del personal en desarrollo (código simulado en Redis); y una nota en "Cambios de alcance" sobre la búsqueda por `POST` y el correo cifrado (research.md §R-04, §R-13)
- [ ] T080 Ejecutar el escaneo base de OWASP ZAP contra el stack local (`docker run --rm -t -v "${PWD}:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://host.docker.internal:8080 -r zap-informe.html`; research.md §R-18), agregar `zap-informe.html` a `.gitignore`, corregir las alertas de riesgo medio o alto (por ejemplo, cabeceras `X-Content-Type-Options`, `Content-Security-Policy`, `Referrer-Policy` y `Permissions-Policy` en `apps/web/nginx.conf`) o justificarlas, y anotar el resultado en la sección de verificación del `README.md` después de la nota de Lighthouse de T077 (EQ-04)
- [ ] T081 Recorrer los 12 escenarios de [quickstart.md](./quickstart.md) en un clon limpio (puertos desplazados y `COMPOSE_PROJECT_NAME` propio si el stack principal está corriendo), cronometrar SC-001, SC-008 y SC-009 y anotar los tiempos en el `README.md`, y corregir cualquier diferencia; luego `npm run build && npm run lint && npm run formato && npm test && npm run cobertura && npm run regla-dependencia && npm run contrato` en verde
- [ ] T082 Abrir el PR de `002-seguridad-usuarios` hacia `main` y confirmar que los 5 checks (`compilacion`, `pruebas`, `cobertura`, `regla-dependencia`, `contrato`) terminan en verde

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (fase 1)**: sin dependencias. T006 después de T003–T005.
- **Base (fase 2)**: depende de la fase 1; bloquea todas las historias. T007 (contrato) antes de
  cualquier código de la API; T009 (migración) antes de T014 y de cualquier adaptador Postgres;
  T012–T013 después de T009–T010.
- **US1 (fase 3)**: depende de la fase 2.
- **US2 (fase 4)**: depende de la fase 2 y de T040–T041 (usa sesiones reales en su prueba de
  integración y T050 modifica `cambiar-clave.ts`).
- **US3 (fase 5)**: depende de la fase 2; T053 usa el inicio de sesión de US1 para comprobar que el
  administrador puede entrar.
- **US4 (fase 6)**: depende de US1 (modifica sus casos de uso y su controlador).
- **US5 (fase 7)**: depende de US2 (`@RequiereRoles` y la versión de seguridad); T071 reutiliza el
  bloqueo de T054.
- **Pulido (fase 8)**: depende de US1–US5.

### Dependencias entre historias

- **US1 (P1)**: independiente tras la fase 2 (crea sus usuarios con `crearUsuarioDePrueba`).
- **US2 (P1)**: necesita sesiones de US1 para probarse de punta a punta.
- **US3 (P1)**: independiente en su lógica; su prueba completa usa el inicio de sesión de US1.
- **US4 (P2)**: amplía US1.
- **US5 (P2)**: usa el control de permisos de US2; su prueba de matriz cubre SC-002.

### Dentro de cada historia

- Pruebas primero (deben fallar) → dominio → infraestructura → aplicación → presentación →
  cableado del módulo → portal.

### Oportunidades de paralelismo

- Fase 1: T002–T005 en paralelo (después de T001).
- Fase 2: T008, T010, T011 en paralelo tras T007/T009; T015, T016, T018, T019, T020, T023, T024,
  T025, T026 y T028 en paralelo; T021 → T022; T027 después de T014 y T023; T029 después de T028.
- US1: T032–T036 juntas; T037, T038, T039 y T042 en paralelo.
- US2: T046–T047 juntas; T051 en paralelo con T048–T050.
- US3: T052–T053 juntas.
- US4: T057–T059 juntas; T062 en paralelo con T060–T061.
- US5: T063–T068 juntas; T069 en paralelo con T070.
- US3 se puede trabajar en paralelo con US2 (archivos distintos); US4 en paralelo con US5 salvo
  por `seguridad.module.ts` (coordinar el cableado).
- Pulido: T076, T077 y T078 en paralelo; T080 después de T077 (las dos editan la sección de verificación del `README.md`).

---

## Ejemplos de ejecución en paralelo

### Fase 2 (después de T007 y T009)

```bash
Tarea: "T015 ErrorProblema y FiltroProblema con Retry-After"
Tarea: "T016 Configuración nueva y reglas de producción"
Tarea: "T018 Pruebas de Correo, Celular, NombreCompleto, Rol y PoliticaClave"
Tarea: "T023 ProtectorDatosAesGcm"   Tarea: "T024 HasherClavesArgon2"   Tarea: "T025 GeneradorSecretosCrypto"
```

### Historia 1

```bash
Tarea: "T032 Pruebas de CodigoOtp"
Tarea: "T033 Pruebas de Sesion"
Tarea: "T034 Pruebas de los casos de uso de autenticación"
Tarea: "T035 Prueba de integración de autenticación"
Tarea: "T036 Pruebas de Ingresar, CambiarClave y ProveedorSesion"
# Luego:
Tarea: "T037 CodigoOtp y Sesion"   Tarea: "T038 Repositorios de sesiones y códigos"   Tarea: "T039 EnviadorOtpSimulado"
```

### Historia 5

```bash
Tarea: "T063 Pruebas de ReglaUltimoAdministrador"
Tarea: "T065 Integración de usuarios"
Tarea: "T066 Matriz de permisos"
Tarea: "T067 Concurrencia del último administrador"
Tarea: "T068 Pruebas de la página de usuarios"
```

---

## Estrategia de implementación

### MVP primero (US1 + US2 + US3)

1. Fase 1 (preparación) y fase 2 (base).
2. Fase 3 (US1: inicio de sesión) y fase 4 (US2: permisos por rol).
3. Fase 5 (US3: primer administrador).
4. **Parar y validar**: quickstart §1, §2, §3 y §5 (parte de permisos). Con esto los demás módulos ya
   pueden proteger sus operaciones con `@RequiereRoles`.

### Entrega incremental

1. Base → US1 → US2 → US3 (MVP: el personal entra y cada operación se protege por rol).
2. US4 → protección contra fuerza bruta (medida "bloqueo en el 6.º intento" de EQ-04).
3. US5 → el administrador incorpora al personal desde el portal.
4. Pulido → datos personales, cobertura, Lighthouse, gitleaks, OWASP ZAP, quickstart completo y PR.

### Commits

Commits convencionales por tarea o grupo lógico, por ejemplo `docs(contrato): auth con cookie,
cambio de clave y búsqueda de usuarios` para T007–T008 y `feat(seguridad): migración 0003` para
T009–T014.

---

## Notas

- [P] = archivos distintos, sin dependencias pendientes.
- Cada tarea incluye o va acompañada de su prueba en el mismo PR (principio V).
- En Windows, si un PostgreSQL nativo ocupa `localhost:5432`, las pruebas de integración se ejecutan
  contra un PostgreSQL temporal en otro puerto (`DATABASE_URL` apuntando a él) igual que en el CI.
- Detenerse en cada punto de control para validar la historia de forma independiente.
