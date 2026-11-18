# Investigación (fase 0): Seguridad y usuarios del personal municipal

Todas las incógnitas del contexto técnico quedan resueltas. Cada decisión indica qué se eligió, por
qué y qué alternativas se descartaron. La entrada técnica es `docs/sdd/002-seguridad-plan.md`; donde
este documento se aparta de ella, lo dice y explica el motivo (siempre la constitución).

## R-01. Capas del módulo `seguridad` y puertos

- **Decisión**: todo el código vive en `apps/api/src/modulos/seguridad/` con sus 4 capas. Como la
  regla de dependencia prohíbe que `dominio/` y `aplicacion/` importen paquetes npm **o módulos core
  de Node** (incluido `node:crypto`), toda operación criptográfica, de tiempo o de red queda detrás de
  un puerto declarado en `dominio/`:

  | Puerto (dominio) | Para qué | Adaptador (infraestructura) |
  |---|---|---|
  | `RepositorioUsuarios` | Usuarios, roles vigentes e historial | `RepositorioUsuariosPostgres` (Prisma) |
  | `RepositorioSesiones` | Sesiones y rotación del refresh token | `RepositorioSesionesPostgres` |
  | `RepositorioCodigosOtp` | Códigos de un solo uso | `RepositorioCodigosOtpPostgres` |
  | `HasherClaves` | Huella y verificación de claves | `HasherClavesArgon2` |
  | `ProtectorDatos` | Cifrar/descifrar celular y correo; HMAC para buscar | `ProtectorDatosAesGcm` |
  | `GeneradorSecretos` | Código de 6 dígitos, refresh token opaco, HMAC del código | `GeneradorSecretosCrypto` |
  | `EmisorTokens` | Firmar y verificar el token de acceso | `EmisorTokensJwt` (`@nestjs/jwt`) |
  | `LimitadorIntentos` | Contadores de fallos y de envíos (FR-006 a FR-009, FR-002a) | `LimitadorIntentosRedis` |
  | `AlmacenVersionSeguridad` | Versión de seguridad vigente por usuario y sesiones revocadas (FR-004, FR-011, FR-015) | `AlmacenVersionSeguridadRedis` con respaldo en PostgreSQL |
  | `EnviadorOTP` | Enviar el código al celular (FR-030) | `EnviadorOtpSimulado` (desarrollo/pruebas); `EnviadorOtpSms` cuando haya proveedor |
  | `Reloj` | Hora actual (pruebas deterministas de vencimientos) | `RelojSistema` |

  El cableado se hace en `seguridad.module.ts` con proveedores `useFactory`, igual que en Catálogo.
- **Por qué**: cumple el principio I y la regla de dependencia de la 001 sin cambiar
  `.dependency-cruiser.cjs`; las reglas (vencimiento del OTP, política de clave, último
  administrador, rotación) se prueban sin base de datos ni red.
- **Alternativas**: llamar a `crypto` desde los casos de uso (lo prohíbe `aplicacion-hacia-dentro`);
  `@nestjs/passport` con estrategias (añade una capa de abstracción que no aporta para un solo tipo
  de token y mete decoradores de NestJS en la lógica).

## R-02. Claves con argon2id

- **Decisión**: paquete `argon2` con `argon2id` y sus parámetros por defecto (memoria 64 MiB,
  3 iteraciones, paralelismo 4). Para un correo inexistente se verifica contra una huella ficticia
  fija, de modo que el tiempo de respuesta no revele si el correo existe (FR-005). Política (FR-022a):
  12 a 128 caracteres, al menos una letra y un número; la nueva no puede coincidir con la temporal
  (se comprueba verificando la nueva contra la huella actual).
- **Por qué**: lo pide la entrada y la constitución (MD3); argon2id es la recomendación actual de
  OWASP.
- **Riesgo**: `argon2` es un módulo nativo. Publica binarios precompilados para `linux-musl-x64`
  (la imagen `node:24-alpine`), pero si una versión no los trae, el `Dockerfile` necesita
  `python3 make g++` en la etapa de build. Alternativa sin compilación: `@node-rs/argon2`. La tarea
  de dependencias verifica el build de la imagen.
- **Alternativas**: bcrypt (límite de 72 bytes, más débil frente a GPU); scrypt de `node:crypto` (sin
  dependencia nativa, pero la constitución nombra argon2id).

## R-03. Código OTP

- **Decisión**: 6 dígitos con `crypto.randomInt(0, 1_000_000)` rellenado con ceros. Se guarda
  `codigo_hash = HMAC-SHA256(CLAVE_HMAC_DATOS, desafioId + ":" + codigo)` y se compara con
  `timingSafeEqual`. Vence a los 5 minutos y admite 5 intentos (`intentos` en la tabla); al pedir un
  código nuevo, los vigentes del mismo usuario se marcan vencidos (`vence_en = now()`). El `id` del
  código es el `desafioId` que recibe el portal.
- **Por qué**: un hash sin clave de un número de 6 dígitos se rompe offline en milisegundos (10⁶
  combinaciones); con HMAC y clave secreta, quien robe la tabla no puede probarlas. argon2 sería
  innecesariamente lento para un valor que vive 5 minutos y ya está limitado a 5 intentos.
- **Alternativas**: SHA-256 sin clave (rompible); argon2 (lento sin beneficio); TOTP con app
  autenticadora (la entrada pide SMS).

## R-04. Cifrado del celular y del correo (MD3) — se aparta de la entrada

- **Decisión**: AES-256-GCM con IV aleatorio de 12 bytes; se guarda `iv ‖ tag ‖ texto` en `bytea`.
  Búsqueda exacta por `HMAC-SHA256(CLAVE_HMAC_DATOS, valor normalizado)`. Las claves llegan por
  variables de entorno (32 bytes en base64) validadas al arrancar con zod.

  **El correo también se cifra** (`correo_cifrado` + `correo_hmac` único), aunque la entrada solo lo
  pide para el celular y `esquema.sql` hoy guarda `usuario.correo` en claro: el principio III de la
  constitución exige cifrar el correo y buscarlo por HMAC, y la gobernanza dice que ante un conflicto
  se corrige el documento. El correo se normaliza (minúsculas, sin espacios) antes del HMAC. Como
  ningún entorno tiene usuarios todavía (esta funcionalidad crea el primero), la migración no
  necesita convertir datos; si encuentra filas, se detiene con un error explicativo.
- **Por qué**: cumple la Ley N.° 29733 y MD3; el inicio de sesión busca por igualdad exacta, que el
  HMAC resuelve.
- **Consecuencia**: no se puede buscar por fragmentos del correo; la búsqueda de usuarios (R-13) es
  por fragmento del **nombre** o por **correo exacto**.
- **Alternativas**: cifrado en la base con `pgcrypto` (la clave viajaría en las consultas y
  aparecería en logs de PostgreSQL); dejar el correo en claro como excepción justificada (posible,
  pero el correo institucional sigue identificando a una persona).

## R-05. Token de acceso y refresh token en cookie

- **Decisión**:
  - **Acceso**: JWT HS256 de 15 minutos firmado con `@nestjs/jwt` (`JWT_SECRETO`, ≥ 32 bytes).
    Claims: `sub` (id del usuario), `sid` (id de la sesión), `roles`, `vs` (versión de seguridad) y
    `dcc` (debe cambiar clave). Sin correo, nombre ni celular (principio VII). Viaja en
    `Authorization: Bearer`; el portal lo guarda **solo en memoria**.
  - **Refresh**: valor opaco `<sesionId>.<32 bytes aleatorios en base64url>`. Se guarda solo
    `SHA-256` del valor (es aleatorio y de alta entropía, no necesita argon2). Viaja en la cookie
    `refresh_personal` con `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, vida igual al
    máximo restante de la sesión. Se elimina el campo `refreshToken` del cuerpo de `SesionPersonal`
    y del cuerpo de `/auth/renovar` (entrada, punto 2).
  - `cookie-parser` lee la cookie solo en el controlador de autenticación.
- **Por qué**: un XSS no puede leer una cookie `HttpOnly`, y `SameSite=Strict` + `Path` restringido
  evita el envío desde otros sitios (CSRF) y fuera de `/auth`. Los navegadores tratan
  `http://localhost` como contexto seguro, así que `Secure` también funciona en desarrollo local.
- **Alternativas**: refresh token en `localStorage` (robable por XSS); sesión de servidor con cookie
  para todo (más simple, pero obliga a protección CSRF en cada operación y rompe el contrato
  `bearerPersonal` que usará la Fase 2).

## R-06. Duración, inactividad y rotación con detección de reutilización

- **Decisión**:
  - Cada sesión guarda `vence_maximo_en` (inicio + 8 h, FR-003) y `ultima_actividad_en`.
  - `/auth/renovar` acepta solo si `now < vence_maximo_en` y `now − ultima_actividad_en ≤ 30 min`
    (FR-003a); al aceptar, **rota** el refresh token: el hash vigente pasa a `refresh_anterior_hash`
    con `rotada_en = now`, se guarda el hash nuevo y se actualiza `ultima_actividad_en`.
  - Si llega un refresh token que coincide con `refresh_anterior_hash`: si la rotación fue hace más
    de 10 s, es **reutilización** → se revocan todas las sesiones del usuario y se registra el evento;
    si fue hace 10 s o menos (dos pestañas que renovaron a la vez), se responde 401 sin revocar.
  - El portal renueva solo si hubo actividad del usuario (teclado, toque o clic) en los últimos
    30 minutos, y serializa las renovaciones entre pestañas con la Web Locks API
    (`navigator.locks.request('renovar-sesion', …)`); como la cookie es compartida, la segunda pestaña
    ya envía el token nuevo.
  - El portal además cierra la sesión en pantalla tras 30 minutos sin actividad.
- **Por qué**: la actividad se mide en el servidor sin escribir en la base en cada petición (solo al
  renovar, cada ≤ 15 min); con renovaciones cada 15 min, quien trabaja nunca supera los 30 min entre
  renovaciones, y quien se ausenta más de 30 min queda fuera. La rotación con detección convierte el
  robo de un refresh token en un evento visible y autolimitado (entrada, punto 3).
- **Alternativas**: actualizar `ultima_actividad_en` en cada petición (una escritura por petición,
  contra EQ-01); sin margen de 10 s (dos pestañas cerrarían todas las sesiones por error).

## R-07. Efecto inmediato de desactivar, cambiar roles, asignar clave temporal o cerrar sesión

- **Decisión**: columna `usuario.version_seguridad` (entero) como fuente de verdad, más una copia en
  Redis (`seg:version:<usuarioId>`, TTL 60 s). Se incrementa **en la misma transacción** que
  desactivar, cambiar roles, asignar clave temporal o cambiar la clave; tras el `COMMIT` se escribe el
  valor nuevo en Redis. En cada petición protegida, `JwtAuthGuard`:
  1. verifica firma y vencimiento del token;
  2. lee de Redis, en una sola ida (`MGET`), la versión (`seg:version:<usuarioId>`) y la marca de
     sesión revocada (`seg:sesion-revocada:<sid>`); si la sesión está marcada como revocada →
     **401**; si la versión no existe o Redis no responde, lee de PostgreSQL `version_seguridad` y
     `sesion.revocada_en` (revocada → **401**) y vuelve a poner la versión en Redis si puede;
  3. si coincide con `vs`, usa los roles del token;
  4. si la versión no coincide, consulta el estado actual del usuario (`activo`, roles vigentes,
     `debe_cambiar_clave`): inactivo → **401**; activo → continúa con los **roles actuales**, de modo
     que una operación que pedía un rol retirado responde **403** (escenario 5 de la historia 2).
  **Sesiones revocadas** (FR-004, FR-013): cada vez que se revoca una sesión (cerrar sesión,
  desactivar al usuario, asignarle clave temporal, cambiar la clave —las demás sesiones— o detectar
  reutilización del refresh), después del `COMMIT` se escribe `SET seg:sesion-revocada:<sid> 1 EX 900`
  (900 s = vida máxima del token de acceso; pasado ese tiempo el token ya venció solo).
- **Por qué**: cumple FR-004, FR-011 y FR-015 (aclaración del 2026-11-17) con una lectura de Redis
  por petición y sin consultar PostgreSQL en el caso normal (EQ-01). El TTL de 60 s acota el único caso
  raro (Redis acepta lecturas pero falló la escritura tras el `COMMIT`) a un minuto como máximo para la
  versión; para la marca de sesión revocada ese mismo caso raro deja servir el token hasta su
  vencimiento (≤ 15 min), porque una clave ausente significa "no revocada". Se registra el fallo de
  escritura como evento para detectarlo.
- **Alternativas**: lista negra de tokens (crece sin límite); consultar PostgreSQL en cada petición
  (contra EQ-01); responder 401 ante cualquier cambio de versión (el usuario vería "no autenticado"
  al perder un rol, contradiciendo la historia 2).

## R-08. Límites de intentos en Redis

- **Decisión**: `INCR` + `EXPIRE` (solo si la clave es nueva, en un `MULTI`) con ventana fija de
  15 minutos:
  - `lim:fallos:correo:<hmac>`: fallos de clave o de código del mismo correo (FR-006). Se usa el HMAC
    del correo, nunca el correo en claro; para correos inexistentes también se calcula, así el
    bloqueo es idéntico (FR-008, historia 4, escenario 4).
  - `lim:fallos:ip:<ip>`: fallos desde el mismo origen (FR-007).
  - `lim:envios:usuario:<usuarioId>`: códigos enviados (FR-002a), máximo 3.

  Antes de comprobar credenciales se consulta si alguno superó su límite: con 5 fallos (o 3 envíos)
  se responde **429** con `Retry-After` = TTL restante de la clave (redondeado hacia arriba) sin
  evaluar los datos, así el 6.º intento se rechaza aunque sea correcto. Un inicio de sesión
  completo con éxito no borra los contadores (evita que un atacante con una cuenta propia los
  reinicie para el origen).
- **IP real**: `app.set('trust proxy', TRUST_PROXY_SALTOS)` (por defecto 1: nginx del portal, que ya
  envía `X-Forwarded-For`). Con el balanceador de producción delante de nginx se configura 2.
- **Si Redis no responde**: el inicio de sesión responde 503 (fallar cerrado); sin contadores
  compartidos no se puede garantizar el bloqueo (FR-009). El resto del sistema sigue funcionando con
  el respaldo de R-07.
- **Por qué**: lo pide la entrada; Redis es compartido por todas las instancias (ADR-005, ADR-007).
- **Alternativas**: ventana deslizante con `ZSET` (más precisa, más compleja; la medida EQ-04 es
  "bloqueo en el 6.º intento", que la ventana fija cumple); contadores en PostgreSQL (escrituras en
  cada intento fallido y en cada instancia).

## R-09. "Nunca sin administrador" con bloqueo de filas

- **Decisión**: los casos de uso que pueden dejar sin administradores (desactivar, quitar el rol
  `ADMINISTRADOR`) corren en una transacción de Prisma que primero ejecuta
  `SELECT u.id FROM seguridad.usuario u JOIN seguridad.usuario_rol ur ON ur.usuario_id = u.id
  WHERE u.activo AND ur.rol_codigo = 'ADMINISTRADOR' AND ur.retirado_en IS NULL FOR UPDATE OF u`;
  con esas filas bloqueadas la regla de dominio decide si la operación deja al menos uno activo; si
  no, `409` `ultimo-administrador`. Dos operaciones simultáneas se serializan: la segunda vuelve a
  contar después del `COMMIT` de la primera.
- **Prueba**: integración con dos usuarios administradores que intentan, en paralelo
  (`Promise.all`), quitarse el rol mutuamente: exactamente una tiene éxito.
- **Alternativas**: comprobación sin bloqueo (condición de carrera); `SERIALIZABLE` (reintentos por
  fallos de serialización en toda la transacción).

## R-10. Control de permisos reutilizable

- **Decisión**: el módulo `seguridad` expone en `fachada.ts` el decorador `@Roles(...roles)`, los
  guards `JwtAuthGuard` y `RolesGuard`, el decorador compuesto `@RequiereRoles(...roles)`
  (`applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(...))`) y el decorador de parámetro
  `@UsuarioActual()`. `SeguridadModule` es `@Global()` y exporta lo que los guards necesitan, así
  otros módulos los usan importando solo la fachada. Los guards lanzan excepciones que
  `FiltroProblema` convierte en `problem+json`:
  - 401 `no-autenticado`: sin token, inválido, vencido, de una sesión revocada o de un usuario
    inactivo.
  - 403 `sin-permiso`: ningún rol admitido.
  - 403 `debe-cambiar-clave`: el usuario tiene clave temporal; solo se le permiten
    `/auth/cambiar-clave`, `/auth/renovar` y `/auth/cerrar-sesion` (FR-022).
- **Prueba de reutilización**: una prueba de integración monta un controlador de prueba con
  `@RequiereRoles('CAJA')` y verifica 401/403/200 (historia 2), además de la matriz de usuarios.
- **Alternativas**: guard global con `@Publico()` para excepciones (más seguro por defecto, pero
  cambiaría el comportamiento de `/salud` y `/catalogo/recetas` de la 001; se reconsiderará cuando
  haya más endpoints protegidos que públicos).

## R-11. Envío del OTP simulado

- **Decisión**: puerto `EnviadorOTP.enviar(destino: Celular, codigo: CodigoOtp, usuarioId)`.
  `EnviadorOtpSimulado` guarda el código en Redis en `dev:otp:<usuarioId>` con TTL de 300 s (sin log
  ni endpoint); en desarrollo se consulta con
  `docker compose -f infra/docker-compose.yml exec redis redis-cli GET dev:otp:<usuarioId>` y las
  pruebas de integración lo leen igual. Variable `ENVIO_OTP` = `simulado` | `sms` (por defecto
  `simulado`). Al arrancar, si `NODE_ENV=production` y `ENVIO_OTP=simulado`, la configuración falla
  y la API no inicia (FR-031). `sms` queda reservado: hasta que haya proveedor, la configuración
  también lo rechaza con un mensaje claro.
- **Por qué**: lo pide la entrada; el caso de uso solo conoce el puerto (SC-011).
- **Alternativas**: imprimir el código en el log (prohibido por FR-027/FR-029); endpoint de
  desarrollo (riesgo de quedar expuesto en producción).

## R-12. Primer administrador

- **Decisión**: `npm run crear-administrador -w apps/api` ejecuta
  `src/modulos/seguridad/presentacion/cli/crear-administrador.ts` (compilado a `dist/…`), que arranca
  un contexto de Nest sin servidor HTTP (`NestFactory.createApplicationContext`) y llama al caso de
  uso `CrearPrimerAdministrador`. Lee `ADMIN_CORREO`, `ADMIN_NOMBRE`, `ADMIN_CELULAR` y `ADMIN_CLAVE`
  de variables de entorno; si falta alguna y hay terminal, las pide de forma interactiva (la clave sin
  eco). Si ya existe un administrador activo, no crea ni modifica nada y termina con código 0 y un
  mensaje. El usuario creado tiene `debe_cambiar_clave = true` (la clave pasó por la terminal o por
  variables de entorno). Imprime solo el id del usuario. En Docker:
  `docker compose -f infra/docker-compose.yml exec api npm run crear-administrador`.
  `asignado_por` del rol inicial es el propio id del administrador creado.
- **Por qué**: ninguna clave queda en el repositorio (FR-023); es idempotente (FR-024).
- **Alternativas**: usuario en `datos-semilla.sql` (dejaría una clave en el repo); endpoint de
  instalación (superficie de ataque permanente).

## R-13. Búsqueda de usuarios sin datos personales en la URL — se aparta de la entrada

- **Decisión**: la entrada pide un parámetro `buscar` en `GET /usuarios`, pero el texto buscado es
  un nombre o un correo, es decir, un dato personal, y el principio VII prohíbe que aparezca en la
  URL (quedaría en logs de nginx y en el historial). Se define `POST /usuarios/busqueda` con cuerpo
  `{ texto?, activo?, pagina?, porPagina? }`. `GET /usuarios` se mantiene con `activo`, `pagina` y
  `porPagina` (sin datos personales). La búsqueda compara `texto` contra `nombre_completo` con
  `ILIKE '%texto%'` (sin distinguir mayúsculas) y, si `texto` tiene forma de correo, contra
  `correo_hmac` (igualdad exacta, R-04).
- **Alternativas**: filtrar en el navegador (rompe con la paginación); `GET` con el texto cifrado en
  la URL (complejo y sigue registrando un identificador estable).

## R-14. Portal web

- **Decisión**: `react-router` 7 (modo declarativo) con rutas `/` (catálogo, ya existe), `/ingresar`
  (dos pasos), `/cambiar-clave` y `/admin/usuarios` (solo `ADMINISTRADOR`). Un `ProveedorSesion`
  (contexto de React) guarda el token de acceso en memoria y el usuario actual; al cargar la página
  llama a `/auth/renovar` para recuperar la sesión desde la cookie. Un middleware de `openapi-fetch`
  agrega `Authorization`, y ante un 401 renueva una vez (Web Locks) y reintenta. El menú muestra solo
  las opciones de los roles del usuario. Si `debeCambiarClave` es `true`, todas las rutas protegidas
  redirigen a `/cambiar-clave`. Mismos criterios de la 001: primero celular, sin desplazamiento
  horizontal a 360 px, formularios con `label`, mensajes con `role="alert"`/`role="status"`.
- **Alternativas**: TanStack Router (más dependencias); guardar el token en `sessionStorage`
  (accesible a un XSS).

## R-15. Migración `0003` y control de deriva con `docs/` — cambia una prueba de la 001

- **Problema**: en la 001, `0001_esquema_inicial/migration.sql` es una copia literal de
  `docs/05-modelo-de-datos/esquema.sql` y una prueba unitaria exige que sean idénticos. Si
  `esquema.sql` se actualiza al estado nuevo (como pide la entrada y el principio III), esa igualdad
  se rompe; y no se puede editar `0001`, porque ya está aplicada (Prisma detectaría el cambio de
  checksum).
- **Decisión**:
  - `0001` y `0002` quedan **congeladas**. Una prueba unitaria fija el SHA-256 de `0001` y
    `0002` sigue comparándose con `datos-semilla.sql` (no cambia).
  - `0003_seguridad_usuarios/migration.sql` hace los `ALTER` de [data-model.md](./data-model.md).
  - `esquema.sql` pasa a describir el **estado actual** completo (con las columnas nuevas).
  - Nueva prueba de integración `esquema-equivalente.e2e-spec.ts`: crea una base temporal, ejecuta
    `esquema.sql` + `datos-semilla.sql`, y compara con la base migrada (columnas con tipo, nulabilidad
    y valor por defecto; restricciones con `pg_get_constraintdef`; índices con `pg_indexes.indexdef`).
    Cualquier diferencia hace fallar el job `pruebas` indicando el objeto distinto.
- **Por qué**: mantiene `docs/` como fuente de verdad del estado actual y las migraciones como
  historia inmutable; detecta la deriva real en vez de exigir igualdad de texto.
- **Alternativas**: carpeta `docs/05-modelo-de-datos/cambios/` con cada `ALTER` y `esquema.sql`
  congelado (el documento dejaría de mostrar el estado actual, contra lo que pide la entrada);
  `prisma migrate diff` (no modela índices parciales, ver research de la 001 §R-03).

## R-16. Configuración nueva y secretos

- **Decisión**: variables nuevas validadas con zod en `configuracion.ts` (los errores nombran la
  variable, nunca el valor):

  | Variable | Regla | Valor de desarrollo |
  |---|---|---|
  | `NODE_ENV` | `development` \| `test` \| `production` | `development` |
  | `JWT_SECRETO` | ≥ 32 bytes | ficticio, marcado "solo desarrollo" |
  | `CLAVE_CIFRADO_DATOS` | base64 de exactamente 32 bytes | ficticio |
  | `CLAVE_HMAC_DATOS` | base64 de ≥ 32 bytes | ficticio |
  | `ENVIO_OTP` | `simulado` \| `sms` | `simulado` |
  | `TRUST_PROXY_SALTOS` | entero ≥ 0 | `1` |

  Los valores de desarrollo van en `.env.example` y como valores por defecto en
  `infra/docker-compose.yml` (así el comando único sigue funcionando sin crear archivos, FR-001 de la
  001). Si `NODE_ENV=production` y alguna clave es igual a su valor de ejemplo, la API no arranca.
  Si gitleaks marca los valores de ejemplo, se agregan a `.gitleaks.toml` como permitidos con un
  comentario, nunca se desactiva la regla.
- **Alternativas**: generar las claves al primer arranque (cambiarían en cada `down -v` y no
  funcionaría con varias instancias).

## R-17. Registro de eventos de seguridad sin datos personales

- **Decisión**: el `Logger` de NestJS registra los eventos `inicio-sesion-exitoso`,
  `inicio-sesion-fallido`, `bloqueo-temporal`, `reutilizacion-refresh`, `usuario-desactivado`,
  `roles-cambiados`, `clave-temporal-asignada` y `clave-cambiada`, identificando solo con
  `usuarioId` o `sesionId` (o nada, si el correo no existe). Nunca correo, nombre, celular, clave,
  código, token ni IP completa. Cierra el punto "observabilidad" que quedó pendiente en la
  aclaración.
- **Prueba**: en las pruebas de integración se reemplaza el logger por uno que acumula las líneas, y
  se verifica que ninguna línea ni ninguna respuesta contiene el correo, el celular, la clave ni el
  código usados en la prueba (SC-007).

## R-18. Escaneo OWASP ZAP (EQ-04)

- **Decisión**: EQ-04 nombra OWASP ZAP como herramienta. Se ejecuta el escaneo base (pasivo) contra
  el stack local levantado con Docker Compose:
  `docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://host.docker.internal:8080 -r zap-informe.html`
  (en Linux se agrega `--add-host=host.docker.internal:host-gateway`). Las alertas de riesgo medio o
  alto se corrigen (por ejemplo, cabeceras de seguridad en `apps/web/nginx.conf`) o se justifican en
  el README; el resultado se anota en la sección de verificación del README. testssl.sh (TLS 1.3)
  queda para el entorno desplegado, porque en local no hay TLS.
- **Por qué**: el principio VI exige comprobar la medida con la herramienta indicada; el escaneo base
  no necesita un entorno desplegado.
- **Alternativas**: escaneo activo (`zap-full-scan.py`; más lento y puede llenar la base con datos
  basura; se deja para el entorno de pruebas); no ejecutar ZAP hasta tener ese entorno (dejaría la
  medida sin comprobar en esta funcionalidad).
