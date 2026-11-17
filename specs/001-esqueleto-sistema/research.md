# Investigación (fase 0): Esqueleto del sistema

Todas las incógnitas del contexto técnico quedan resueltas. Cada decisión indica qué se eligió, por
qué y qué alternativas se descartaron.

## R-01. Monorepo y versiones base

- **Decisión**: npm workspaces (`apps/api`, `apps/web`, `packages/contracts`), Node.js 24 LTS,
  TypeScript 5.x, `tsconfig.base.json` compartido con `strict: true`. Versiones exactas fijadas en
  `package-lock.json`; imágenes Docker con etiqueta de versión mayor (`node:24-alpine`,
  `postgres:16-alpine`, `redis:7-alpine`, `nginx:1-alpine`).
- **Por qué**: lo pide la entrada; npm viene con Node y no exige herramientas extra (SC-001).
- **Alternativas**: pnpm o Turborepo (más rápidos, pero una herramienta más que instalar); repos
  separados (rompe el comando único y la generación de tipos).

## R-02. Estructura de capas y lugar del chequeo de salud

- **Decisión**: `apps/api/src/modulos/<modulo>/{dominio,aplicacion,infraestructura,presentacion}`
  con los nombres `seguridad`, `catalogo`, `tramites`, `pagos`, `inspecciones`, `licencias`,
  `plazos`, `notificaciones`, `reportes`. Carpetas vacías con `.gitkeep`. El chequeo de salud va en
  `src/operacion/salud/` con las mismas 4 capas; el cliente Prisma y el de Redis, en
  `src/compartido/infraestructura/`. Los módulos Nest (`*.module.ts`) hacen de raíz de composición:
  conectan puertos con adaptadores usando proveedores con `useFactory`, para que `dominio` y
  `aplicacion` no necesiten decoradores de NestJS.
- **Por qué**: la constitución fija 9 módulos; un décimo módulo exigiría enmienda. La salud es una
  preocupación operativa, no de negocio.
- **Alternativas**: `@nestjs/terminus` (agrega dependencia y su formato de respuesta no coincide con
  el esquema `Salud`); poner la salud en `seguridad` (mezcla responsabilidades).

## R-03. Prisma con multiSchema y migraciones a partir de los SQL de `docs/`

- **Decisión**: Prisma ORM 6.x con `schemas = ["comun","seguridad","catalogo","tramites","pagos",
  "inspecciones","licencias","plazos","notificaciones"]` en el `datasource`. Migraciones escritas a
  mano:
  - `0001_esquema_inicial/migration.sql`: copia literal de `docs/05-modelo-de-datos/esquema.sql`.
  - `0002_datos_semilla/migration.sql`: copia literal de `datos-semilla.sql`.

  `schema.prisma` se obtiene con `prisma db pull` sobre una base migrada y se versiona. Los nombres
  de tabla repetidos entre esquemas (`auditoria` en 4 esquemas) se renombran en el modelo Prisma
  (`AuditoriaTramites`, `AuditoriaPagos`, …) con `@@map("auditoria")` y `@@schema(...)`. El
  arranque del contenedor ejecuta `prisma migrate deploy` antes de `node dist/main.js`.
- **Por qué**: `migrate deploy` aplica cada migración una sola vez (tabla `_prisma_migrations`), lo
  que da idempotencia al volver a levantar (FR-004) y carga el catálogo en todos los entornos,
  incluida producción (FR-006). Copiar los SQL mantiene `docs/` como fuente de verdad (principio III).
- **Control de deriva**: una prueba (en el job `pruebas`) compara el contenido de ambas migraciones
  con los archivos de `docs/05-modelo-de-datos/`. No se usa `prisma migrate diff`, porque
  `esquema.sql` tiene índices parciales que Prisma 6 no modela y la comparación siempre daría
  diferencias falsas.
- **Alternativas**: `prisma db seed` para las semillas (no es versionado ni se ejecuta en
  producción, contradice la aclaración del 2026-11-16); Flyway (otra herramienta); generar el SQL
  desde `schema.prisma` (perdería los `CHECK` y comentarios de `esquema.sql`).
- **Riesgo**: Prisma 7 cambia la configuración (`prisma.config.ts`, adaptadores de driver
  obligatorios). Se queda en 6.x mientras NestJS se compile como CommonJS; la migración a 7 será una
  tarea aparte.

## R-04. Datos ficticios de prueba (FR-006a)

- **Decisión**: esta funcionalidad no necesita datos ficticios. Se deja la regla: si en el futuro se
  necesitan, irán en `apps/api/prisma/semillas-desarrollo/` (fuera de `migrations/`), con un script
  `npm run semillas:desarrollo -w apps/api` que se niega a ejecutarse si `NODE_ENV=production`. No
  se crea código vacío.
- **Por qué**: evita código sin uso y garantiza que `migrate deploy` nunca los aplique.

## R-05. Redis con ioredis y cache-aside del catálogo

- **Decisión**: un único cliente ioredis compartido con `lazyConnect: true`,
  `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `connectTimeout: 2000` y una
  `retryStrategy` que reintenta indefinidamente con espera creciente (máx. 5 s). El catálogo usa el
  patrón Decorator del diseño interno: `RepositorioCatalogoConCache` envuelve a
  `RepositorioCatalogoPostgres`. Clave `catalogo:recetas:<TIPO|TODOS>`, valor JSON, `SET ... EX 300`.
  Si Redis falla al leer o escribir, se registra una advertencia (sin datos de conexión) y se lee de
  PostgreSQL: el catálogo sigue funcionando en estado `DEGRADADO`.
- **Por qué**: sin cola offline, una caída de Redis falla rápido en vez de colgar peticiones; la
  reconexión automática hace que la salud vuelva a `OK` sin reiniciar (caso límite).
- **Alternativas**: `@nestjs/cache-manager` (oculta el manejo de errores y la clave); node-redis
  (válido, pero la entrada fija ioredis).

## R-06. Chequeo de salud con timeout por dependencia

- **Decisión**: `ConsultarSalud` ejecuta en paralelo dos sondas (`SondaPostgres`: `SELECT 1` vía
  `$queryRaw`; `SondaRedis`: `PING`), cada una envuelta en `conTiempoLimite(promesa, 2000 ms)`. Una
  sonda que falla o supera el tiempo vale `CAIDO`. La función pura `calcularEstadoGeneral(bd, cache)`
  devuelve `OK`, `DEGRADADO` o `CAIDO`, y el controlador responde 200 o 503 según el resultado
  (tabla en [contracts/salud.md](./contracts/salud.md)). Cabecera `Cache-Control: no-store`.
  `version` sale de la variable `VERSION_SERVICIO` (por defecto, la versión de `apps/api/package.json`).
- **Arranque con la base caída**: `PrismaServicio.onModuleInit` intenta `$connect` y, si falla,
  registra una advertencia y no detiene la aplicación; Prisma reconecta en la siguiente consulta.
  Así el chequeo informa `CAIDO` hasta que la base esté lista y luego `OK` sin reiniciar.
- **Por qué**: en paralelo, el peor caso es ≈ 2 s, por debajo de los 3 s de SC-003.
- **Alternativas**: sondas en serie (peor caso 4 s); timeout global único (no indica cuál falló).

## R-07. Errores HTTP en formato `problem+json`

- **Decisión**: un filtro global de excepciones convierte los errores en `Problema` (RFC 9457,
  `application/problem+json`) sin trazas ni detalles internos; los 500 usan un `title` genérico.
- **Por qué**: lo exige el contrato y FR-011 / principio VII.

## R-08. Validación del parámetro `tipo` y respuesta 422

- **Decisión**: `tipo` acepta solo `LICENCIA` o `TRAMITE_CONECTADO`; cualquier otro valor responde
  `422` con `Problema` y `errores: [{campo: "tipo", mensaje: ...}]`. Se declara
  `'422': { $ref: '#/components/responses/NoProcesable' }` en `GET /catalogo/recetas` dentro del
  mismo cambio previo de `openapi.yaml`.
- **Por qué**: el contrato solo declara 200; responder un código no declarado lo contradiría
  (principio II). `NoProcesable` ya existe y es el código de validación que usa el resto del contrato.
- **Alternativas**: ignorar el valor inválido y devolver todas las recetas (oculta errores del
  cliente); 400 (no lo usa el contrato en ninguna otra operación).

## R-09. Contratos de tipos y cliente del portal

- **Decisión**: `packages/contracts` ejecuta `openapi-typescript docs/06-contrato-api/openapi.yaml
  -o src/generado/api.d.ts` en su script `generar` (llamado desde `prebuild` y `pretest`). La carpeta
  `generado/` está en `.gitignore`. El portal usa `openapi-fetch` con esos tipos; el backend usa los
  mismos tipos en los DTO de salida para que el compilador detecte diferencias.
- **Por qué**: si el contrato cambia y el código no, falla la compilación (verificación 1).
- **Alternativas**: versionar el archivo generado (riesgo de quedar desactualizado); orval/openapi
  generator (genera más código del necesario).

## R-10. Validación de respuestas contra el contrato (FR-020)

- **Decisión**: helper `test/apoyo/validarContrato.ts` que carga `openapi.yaml` con `yaml`, resuelve
  `$ref` con `@redocly/openapi-core` (`bundle` con `dereference: true`) y compila el esquema de la
  respuesta de cada operación/código con **Ajv 2020** + `ajv-formats` (OpenAPI 3.1 usa JSON Schema
  2020-12). Las pruebas Supertest llaman a `esperarCumpleContrato('get', '/salud', res)`.
- **Por qué**: `jest-openapi` y similares solo soportan OpenAPI 3.0; el contrato es 3.1 (tipos
  `[integer, 'null']`).
- **Alternativas**: Prism como proxy de validación (otro proceso en CI); Schemathesis (Python).

## R-11. Pruebas y cobertura

- **Decisión**:
  - Unitarias (`test/unit`): dominio y aplicación con dobles en memoria (sin base ni red).
  - Integración (`test/integracion`): `Test.createTestingModule` + Supertest. El caso `OK` y el
    catálogo usan PostgreSQL y Redis reales (servicios del CI / compose local). Los casos
    `DEGRADADO`, `CAIDO` y "dependencia colgada" sustituyen las sondas con `overrideProvider` por
    dobles que fallan o nunca resuelven, para no depender de apagar contenedores en CI. La caída real
    se comprueba en el quickstart con `docker stop`.
  - Cobertura: `collectCoverageFrom: ['src/**/*.ts']` y `coverageThreshold` con claves glob
    `'./src/**/dominio/**/*.ts'` y `'./src/**/aplicacion/**/*.ts'` en 80 % de líneas y ramas. Como
    `catalogo` y `operacion/salud` tienen código en esas capas, los globs siempre encuentran
    archivos; las carpetas vacías (solo `.gitkeep`) no cuentan.
  - Portal: Jest + ts-jest + jsdom + Testing Library (constitución: Jest). La URL base es relativa
    (`/api/v1`) para no depender de `import.meta.env` en las pruebas.
- **Alternativas**: Vitest para el portal (más natural con Vite, pero la constitución nombra Jest);
  Testcontainers (más lento y requiere Docker dentro del job).

## R-12. Regla de dependencia con dependency-cruiser

- **Decisión**: `.dependency-cruiser.cjs` con reglas `forbidden`, severidad `error`:
  1. `dominio-sin-externos`: desde `src/(modulos|operacion)/[^/]+/dominio/` hacia paquetes npm o
     módulos core de Node.
  2. `dominio-sin-otras-capas`: desde `dominio/` hacia `aplicacion/`, `infraestructura/` o
     `presentacion/`.
  3. `aplicacion-hacia-dentro`: desde `aplicacion/` hacia `infraestructura/`, `presentacion/` o
     paquetes npm.
  4. `infraestructura-no-presentacion`: desde `infraestructura/` hacia `presentacion/`.
  5. `aislamiento-entre-modulos`: desde `src/modulos/([^/]+)/` hacia `src/modulos/` de otro módulo
     (`pathNot: src/modulos/$1/`) salvo su `fachada.ts`.
  6. `sin-ciclos`: dependencias circulares.

  Comando: `depcruise apps/api/src --config .dependency-cruiser.cjs --output-type err-long`
  (indica archivo y regla, escenario 3 de la historia 4). Se incluye una prueba de la configuración
  con archivos de ejemplo en `apps/api/test/regla-dependencia/fixtures/` que deben fallar.
- **Alternativas**: `eslint-plugin-boundaries` (válido, pero la constitución nombra dependency-cruiser).

## R-13. Lint del contrato

- **Decisión**: `redocly lint docs/06-contrato-api/openapi.yaml` con `redocly.yaml` basado en
  `recommended`. Solo los errores hacen fallar el job; si una regla del conjunto recomendado no
  aplica al contrato actual (por ejemplo, `operation-4xx-response` en `/salud`), se baja a `warn` en
  `redocly.yaml` con un comentario que lo justifique.
- **Por qué**: lo pide la entrada; detecta `$ref` rotos, esquemas inválidos y ejemplos incorrectos.

## R-14. Docker Compose con un solo comando

- **Decisión**: `infra/docker-compose.yml` con 4 servicios:
  - `postgres` (`postgres:16-alpine`, volumen nombrado, healthcheck `pg_isready`).
  - `redis` (`redis:7-alpine`, healthcheck `redis-cli ping`).
  - `api` (build desde la raíz con `apps/api/Dockerfile`; `depends_on` postgres y redis
    `service_healthy`; healthcheck `wget -qO- http://localhost:3000/api/v1/salud`).
  - `web` (build `apps/web/Dockerfile`: Vite build servido por nginx con proxy `/api/` → `api:3000`;
    `depends_on` api `service_healthy`).

  Todas las variables usan interpolación con valor por defecto (`${PUERTO_WEB:-8080}`), así el
  comando funciona sin crear ningún archivo. Para cambiar un puerto ocupado se copia `.env.example`
  a `infra/.env` (Compose lo lee automáticamente desde la carpeta del archivo).
- **Por qué**: cumple FR-001 y el caso límite del puerto ocupado sin pasos manuales por defecto.
- **Alternativas**: scripts `npm run dev` sin contenedores (requiere instalar PostgreSQL y Redis).

## R-15. Variables de entorno y secretos

- **Decisión**: `.env.example` en la raíz con `DATABASE_URL`, `REDIS_URL`, `PUERTO_API`,
  `PUERTO_WEB`, `PUERTO_POSTGRES`, `PUERTO_REDIS`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_DB`, `CATALOGO_CACHE_TTL_SEGUNDOS=300`, `SALUD_TIMEOUT_MS=2000`, `VERSION_SERVICIO`.
  Valores por defecto de desarrollo: usuario y base `licencias`; contraseñas de ejemplo marcadas
  (`cambiar_en_produccion_solo_desarrollo`). La configuración se
  valida al arrancar con un esquema (`zod`) en `compartido/infraestructura/configuracion.ts`.
  `.env` ya está en `.gitignore`; se agrega `infra/.env`.
- **Verificación de secretos (SC-002)**: `gitleaks detect` (imagen Docker oficial) en el quickstart.
- **Alternativas**: `@nestjs/config` con Joi (válido; zod da tipos inferidos sin duplicar).

## R-16. Portal primero celular

- **Decisión**: SPA de una sola página (`Inicio`) sin router todavía. CSS propio con unidades
  relativas, `max-width: 100%`, tarjetas en una columna a 360 px y cuadrícula desde 768 px;
  `<meta name="viewport" content="width=device-width, initial-scale=1">`, `lang="es"`, contraste AA,
  estados con `role="status"`/`role="alert"`. Tasa formateada con `Intl.NumberFormat('es-PE',
  { style: 'currency', currency: 'PEN' })` a partir del texto del contrato; plazo como
  "N días hábiles". La petición pide `?tipo=LICENCIA`.
- **Por qué**: FR-013 a FR-016, SC-005 y SC-006 (Lighthouse ≥ 90).
- **Alternativas**: framework CSS (peso extra para una sola página).

## R-17. CI en GitHub Actions

- **Decisión**: `.github/workflows/ci.yml` en `pull_request` y `push` a `main`, Node 24 con caché de
  npm, 5 jobs con nombres estables (son los que exigirá la protección de `main`): `compilacion`,
  `pruebas`, `cobertura`, `regla-dependencia`, `contrato`. Detalle en
  [contracts/ci-verificaciones.md](./contracts/ci-verificaciones.md).
- **Alternativas**: un solo job con 5 pasos (más simple, pero la protección solo vería un check).

## R-18. Protección de `main` (FR-019a)

- **Decisión**: última tarea. Tras una ejecución verde del CI, se aplica con
  `gh api -X PUT repos/{owner}/{repo}/branches/main/protection` exigiendo los 5 checks
  (`strict: true`), PR obligatorio (0 aprobaciones, proyecto de una sola persona), `enforce_admins:
  true` y sin push forzado ni borrado. El README documenta el comando y cómo comprobarlo (un
  `git push origin main` directo debe ser rechazado).
- **Por qué**: GitHub solo ofrece como checks requeridos los que ya se ejecutaron alguna vez.
