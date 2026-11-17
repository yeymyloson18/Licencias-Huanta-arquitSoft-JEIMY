---
description: "Lista de tareas de la funcionalidad 001: Esqueleto del sistema"
---

# Tareas: Esqueleto del sistema

**Entrada**: documentos de diseño de `specs/001-esqueleto-sistema/`

**Prerrequisitos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: incluidas. Las exige la constitución (principio V: "ninguna tarea se considera terminada
sin sus pruebas automáticas") y la especificación (FR-019, FR-020). En cada historia, las pruebas se
escriben primero y deben fallar antes de implementar.

**Organización**: tareas agrupadas por historia de usuario. Las historias US1 y US2 son ambas P1;
se ejecuta primero **US2** porque el healthcheck del contenedor `api` en Docker Compose (US1)
consulta `/api/v1/salud`.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[USn]**: historia de usuario de `spec.md` a la que pertenece la tarea.
- Rutas relativas a la raíz del repositorio (monorepo: `apps/api`, `apps/web`, `packages/contracts`, `infra`).

## Convenciones para todas las tareas

- TypeScript `strict`; prohibido `any` (salvo adaptador sin tipos, con comentario).
- Nombres del dominio en español (constitución, principio IV).
- `dominio/` no importa NestJS, Prisma, ioredis ni ningún paquete npm; `aplicacion/` tampoco importa
  paquetes npm ni `infraestructura/`/`presentacion/` (research.md §R-12). El cableado de puertos con
  adaptadores se hace en los `*.module.ts` con proveedores `useFactory`.
- Ningún log ni respuesta incluye `DATABASE_URL`, `REDIS_URL`, contraseñas ni mensajes internos de excepción.

---

## Fase 1: Preparación (infraestructura compartida)

**Propósito**: inicializar el monorepo y las herramientas de calidad.

- [X] T001 Crear `package.json` raíz: `"private": true`, `"workspaces": ["apps/*", "packages/*"]`, `"engines": { "node": ">=24" }`; devDependencies `typescript@5`, `eslint`, `typescript-eslint`, `prettier`, `dependency-cruiser`, `@redocly/cli`; scripts `generar` (`npm run generar -w packages/contracts`), `build` (`npm run generar && npm run build --workspaces --if-present`), `typecheck`, `lint` (`eslint .`), `formato` (`prettier --check .`), `test` (`npm run generar && npm test --workspaces --if-present`), `cobertura` (`npm run cobertura -w apps/api`), `regla-dependencia` (`depcruise apps/api/src --config .dependency-cruiser.cjs --output-type err-long`), `contrato` (`redocly lint docs/06-contrato-api/openapi.yaml`)
- [X] T002 [P] Crear `tsconfig.base.json` con `"strict": true`, `"noImplicitAny": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, `"forceConsistentCasingInFileNames": true`, `"esModuleInterop": true`, `"skipLibCheck": true`, `"target": "ES2022"`
- [X] T003 [P] Crear `eslint.config.mjs` con `typescript-eslint` (configuración `strictTypeChecked` sobre `apps/*/src` y `packages/*/src`), regla `@typescript-eslint/no-explicit-any: "error"`, e `ignores` para `**/dist`, `**/coverage`, `packages/contracts/src/generado`, `apps/api/test/regla-dependencia/fixtures`
- [X] T004 [P] Crear `.prettierrc` (`singleQuote: true`, `printWidth: 100`, `trailingComma: "all"`) y `.prettierignore` con `docs/`, `specs/`, `.specify/`, `.claude/`, `tecnologia/`, `**/dist`, `**/coverage`, `packages/contracts/src/generado`, `package-lock.json`, `*.sql`
- [X] T005 [P] Ampliar `.gitignore` con `dist/`, `coverage/`, `packages/contracts/src/generado/`, `infra/.env` (mantener `node_modules/`, `.env`, `.vscode/`, `Thumbs.db`)
- [X] T006 [P] Crear `.env.example` con comentario inicial "Valores ficticios solo para desarrollo local. No usar en producción." y las variables `PUERTO_API=3000`, `PUERTO_WEB=8080`, `PUERTO_POSTGRES=5432`, `PUERTO_REDIS=6379`, `POSTGRES_USER=licencias`, `POSTGRES_PASSWORD=cambiar_en_produccion_solo_desarrollo`, `POSTGRES_DB=licencias`, `DATABASE_URL=postgresql://licencias:cambiar_en_produccion_solo_desarrollo@localhost:5432/licencias`, `REDIS_URL=redis://localhost:6379`, `CATALOGO_CACHE_TTL_SEGUNDOS=300`, `SALUD_TIMEOUT_MS=2000`, `VERSION_SERVICIO=1.0.0` (research.md §R-15)
- [X] T007 Crear el workspace `apps/api`: `apps/api/package.json` (`"name": "@licencias/api"`, dependencias `@nestjs/common@11`, `@nestjs/core@11`, `@nestjs/platform-express@11`, `reflect-metadata`, `rxjs`, `@prisma/client@6`, `ioredis@5`, `zod`, `@licencias/contracts`; devDependencies `prisma@6`, `@nestjs/cli@11`, `@nestjs/testing@11`, `jest@30`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`, `ajv`, `ajv-formats`, `yaml`, `@redocly/openapi-core`; scripts `build` (`prisma generate && nest build`), `start` (`node dist/main.js`), `test` (`jest`), `test:unit`, `test:integracion`, `cobertura`), `apps/api/tsconfig.json` (extiende la base, `module: commonjs`, `experimentalDecorators`, `emitDecoratorMetadata`), `apps/api/tsconfig.build.json` (excluye `test/`) y `apps/api/nest-cli.json`
- [X] T008 [P] Crear el workspace `apps/web`: `apps/web/package.json` (`"name": "@licencias/web"`, dependencias `react@19`, `react-dom@19`, `openapi-fetch`, `@licencias/contracts`; devDependencies `vite`, `@vitejs/plugin-react`, `jest@30`, `ts-jest`, `jest-environment-jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@types/react`, `@types/react-dom`; scripts `dev`, `build` (`tsc --noEmit && vite build`), `test` (`jest`)), `apps/web/tsconfig.json`, `apps/web/vite.config.ts` (proxy de desarrollo `/api` → `http://localhost:3000`), `apps/web/index.html` (`<html lang="es">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, título "Licencias de funcionamiento – Municipalidad Provincial de Huanta") y `apps/web/src/main.tsx` provisional que monta `<h1>` con el mismo título
- [X] T009 [P] Crear el workspace `packages/contracts`: `packages/contracts/package.json` (`"name": "@licencias/contracts"`, `"main"`/`"types"` en `src/index.ts`, devDependency `openapi-typescript`, script `generar`: `openapi-typescript ../../docs/06-contrato-api/openapi.yaml -o src/generado/api.d.ts`), `packages/contracts/tsconfig.json` y `packages/contracts/src/index.ts` que reexporta `export type { paths, components, operations } from './generado/api'`
- [X] T010 Ejecutar `npm install` en la raíz para generar `package-lock.json` y comprobar que `npm run generar` crea `packages/contracts/src/generado/api.d.ts`
- [X] T011 [P] Crear `.gitattributes` en la raíz con las líneas `* text=auto` y `*.sh text eol=lf` (los scripts de shell, como `infra/prueba-humo.sh`, deben conservar finales de línea LF para ejecutarse dentro de contenedores Linux aunque se editen en Windows); ejecutar `git add --renormalize .` y comprobar con `git ls-files --eol` que los `.sh` quedan en `lf`

---

## Fase 2: Base (prerrequisitos bloqueantes)

**Propósito**: contrato corregido, base de datos migrada, aplicación NestJS que arranca y apoyo de pruebas.

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta terminar esta fase. **T012 va antes que cualquier código** (contrato primero, principio II).

- [X] T012 Corregir `docs/06-contrato-api/openapi.yaml`: en `/salud` → `get.responses.'200'.description` = "Servicio sano (OK) o degradado (DEGRADADO, solo falla la caché; la instancia sigue recibiendo tráfico, ADR-005)." y `'503'.description` = "La base de datos no responde; el balanceador deja de enviar tráfico a esta instancia."; en `/catalogo/recetas` → `get.responses` agregar `'422': { $ref: '#/components/responses/NoProcesable' }` (contracts/salud.md, contracts/catalogo-recetas.md)
- [X] T013 [P] Crear `redocly.yaml` con `extends: [recommended]`; ejecutar `npm run contrato` y, si alguna regla del conjunto recomendado no aplica al contrato actual (p. ej. `operation-4xx-response` en `/salud`), bajarla a `warn` con un comentario que lo justifique, hasta que el comando termine sin errores (research.md §R-13)
- [X] T014 [P] Crear `apps/api/prisma/migrations/0001_esquema_inicial/migration.sql` como copia literal de `docs/05-modelo-de-datos/esquema.sql`, `apps/api/prisma/migrations/0002_datos_semilla/migration.sql` como copia literal de `docs/05-modelo-de-datos/datos-semilla.sql` y `apps/api/prisma/migrations/migration_lock.toml` con `provider = "postgresql"`
- [X] T015 [P] Escribir la prueba `apps/api/test/unit/migraciones.spec.ts` que compara byte a byte (normalizando `\r\n` → `\n`) cada `migration.sql` con su archivo de `docs/05-modelo-de-datos/` y falla indicando cuál difiere (research.md §R-03; no usar `prisma migrate diff`)
- [X] T016 Crear `apps/api/prisma/schema.prisma`: `generator client { provider = "prisma-client-js" }`, `datasource db { provider = "postgresql", url = env("DATABASE_URL"), schemas = ["comun","seguridad","catalogo","tramites","pagos","inspecciones","licencias","plazos","notificaciones"] }` (agregar `previewFeatures = ["multiSchema"]` solo si la versión 6.x instalada aún lo exige). Obtener los modelos con `prisma migrate deploy` + `prisma db pull` sobre un PostgreSQL 16 temporal (`docker run --rm -d -p 5432:5432 -e POSTGRES_USER=licencias -e POSTGRES_PASSWORD=cambiar_en_produccion_solo_desarrollo -e POSTGRES_DB=licencias postgres:16-alpine`); renombrar las tablas `auditoria` repetidas como `AuditoriaTramites`, `AuditoriaPagos`, `AuditoriaInspecciones`, `AuditoriaLicencias` con `@@map("auditoria")` y su `@@schema(...)`; el modelo de `catalogo.receta` debe llamarse `Receta` con `@@schema("catalogo")`
- [X] T017 [P] Crear `apps/api/src/compartido/infraestructura/configuracion.ts`: esquema `zod` que valida `DATABASE_URL` (url), `REDIS_URL` (url), `PUERTO_API` (entero, por defecto 3000), `CATALOGO_CACHE_TTL_SEGUNDOS` (entero > 0, por defecto 300), `SALUD_TIMEOUT_MS` (entero > 0, por defecto 2000), `VERSION_SERVICIO` (texto, por defecto la versión de `apps/api/package.json`); exporta `cargarConfiguracion(env)`; si falla, el error lista solo los **nombres** de variables inválidas, nunca sus valores. Prueba en `apps/api/test/unit/compartido/configuracion.spec.ts`
- [X] T018 [P] Crear `apps/api/src/compartido/infraestructura/prisma.servicio.ts`: `PrismaServicio extends PrismaClient` con `onModuleInit` que intenta `$connect()` y, si falla, registra `Logger.warn('PostgreSQL no disponible al arrancar; se reintentará en la siguiente consulta')` sin lanzar error; `onModuleDestroy` llama `$disconnect()` (research.md §R-06)
- [X] T019 [P] Crear `apps/api/src/compartido/infraestructura/redis.proveedor.ts`: token `REDIS_CLIENTE` y proveedor que crea `new Redis(REDIS_URL, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 2000, retryStrategy: (n) => Math.min(n * 200, 5000) })`, conecta sin bloquear el arranque, escucha `error` registrando solo "Redis no disponible" (sin URL) y cierra con `quit()` al destruir el módulo (research.md §R-05)
- [X] T020 Crear `apps/api/src/compartido/compartido.module.ts` (`@Global()`) que provee y exporta la configuración (token `CONFIGURACION`), `PrismaServicio` y `REDIS_CLIENTE`
- [X] T021 [P] Crear `apps/api/src/compartido/presentacion/filtro-problema.ts`: filtro global de excepciones que responde `application/problem+json` con el esquema `Problema` (`type`, `title`, `status`, opcional `detail` y `errores: [{campo, mensaje}]` solo en 422); para errores no controlados responde 500 con `title: "Error interno del servidor"` sin traza ni mensaje original; exporta la clase `ErrorValidacion(errores)` que se traduce a 422. Prueba en `apps/api/test/unit/compartido/filtro-problema.spec.ts` (research.md §R-07)
- [X] T022 Crear `apps/api/src/app.module.ts` (importa `CompartidoModule`) y `apps/api/src/main.ts`: `setGlobalPrefix('api/v1')`, filtro global de T021, `enableShutdownHooks()`, escucha en `PUERTO_API`, registra al arrancar solo puerto y versión
- [X] T023 [P] Crear `apps/api/jest.config.ts` con dos proyectos: `unit` (`test/unit/**/*.spec.ts`) e `integracion` (`test/integracion/**/*.e2e-spec.ts`, `testTimeout: 15000`), `ts-jest`, `collectCoverageFrom: ['src/**/*.ts']`; y la configuración de cobertura del script `cobertura` (`jest --selectProjects unit --coverage`) con `coverageThreshold` `{ './src/**/dominio/**/*.ts': { lines: 80, branches: 80 }, './src/**/aplicacion/**/*.ts': { lines: 80, branches: 80 } }` (research.md §R-11)
- [X] T024 [P] Crear `apps/api/test/apoyo/validarContrato.ts`: carga `docs/06-contrato-api/openapi.yaml`, resuelve `$ref` con `@redocly/openapi-core` (`bundle` con `dereference: true`), compila con `Ajv2020` (`ajv/dist/2020`) + `ajv-formats` y exporta `esperarCumpleContrato(metodo, ruta, respuesta)` que busca el esquema de `paths[ruta][metodo].responses[status]` según el `content-type` y falla con los errores de Ajv; prueba propia en `apps/api/test/unit/apoyo/validarContrato.spec.ts` con un cuerpo `Salud` válido y otro inválido (research.md §R-10)
- [X] T025 [P] Crear `apps/web/jest.config.ts` (`testEnvironment: 'jsdom'`, `ts-jest`, `moduleNameMapper` para `\.css$`) y `apps/web/jest.setup.ts` que importa `@testing-library/jest-dom`

**Punto de control**: `npm run build`, `npm run contrato` y `npm run test:unit -w apps/api` pasan; la API arranca con `node apps/api/dist/main.js` aunque PostgreSQL y Redis no estén disponibles.

---

## Fase 3: Historia de usuario 2 – Chequeo de salud para el balanceador y el monitoreo (Prioridad: P1) 🎯 MVP

**Objetivo**: `GET /api/v1/salud` informa `OK`, `DEGRADADO` o `CAIDO` con 200/503 y responde en < 3 s aunque una dependencia se cuelgue (EQ-03).

**Prueba independiente**: con PostgreSQL y Redis levantados consultar `/api/v1/salud`; detener Redis y consultar; detener PostgreSQL y consultar; verificar cada respuesta contra [contracts/salud.md](./contracts/salud.md).

### Pruebas de la historia 2 (escribir primero; deben fallar)

- [X] T026 [P] [US2] Prueba unitaria `apps/api/test/unit/operacion/salud/estado-salud.spec.ts`: `calcularEstadoGeneral` con las 4 combinaciones de la tabla de data-model.md §2 (`OK/OK→OK`, `OK/CAIDO→DEGRADADO`, `CAIDO/OK→CAIDO`, `CAIDO/CAIDO→CAIDO`); y `apps/api/test/unit/operacion/salud/codigo-http.spec.ts`: `codigoHttpPara(estado)` (`OK`→200, `DEGRADADO`→200, `CAIDO`→503)
- [X] T027 [P] [US2] Prueba unitaria `apps/api/test/unit/operacion/salud/consultar-salud.spec.ts` con sondas falsas: ambas responden → `OK`; sonda de caché rechaza → `DEGRADADO`; sonda de base rechaza → `CAIDO`; sonda que nunca resuelve → `CAIDO` al cumplirse `timeoutMs` (usar `jest.useFakeTimers`); las dos sondas se invocan en paralelo (el tiempo total no suma ambos timeouts); `version` se copia de la configuración
- [X] T028 [P] [US2] Prueba de integración `apps/api/test/integracion/salud.e2e-spec.ts` con Supertest: (a) con PostgreSQL y Redis reales → 200 `OK`; (b) con `overrideProvider` de la sonda de caché que rechaza → 200 `DEGRADADO`, `cache: "CAIDO"`; (c) sonda de base que rechaza → 503 `CAIDO`; (d) sonda de base que nunca resuelve → 503 en menos de 3000 ms; en todos los casos `esperarCumpleContrato('get', '/salud', res)`, cabecera `Cache-Control: no-store`, sin cabecera `Authorization`, y el cuerpo no contiene `postgres`, `redis://`, `password` ni texto de excepción

### Implementación de la historia 2

- [X] T029 [P] [US2] Crear `apps/api/src/operacion/salud/dominio/estado-salud.ts`: tipos `EstadoDependencia = 'OK' | 'CAIDO'`, `EstadoGeneral = 'OK' | 'DEGRADADO' | 'CAIDO'`, interfaz `EstadoSalud { estado; baseDeDatos; cache; version }`, función pura `calcularEstadoGeneral(baseDeDatos, cache)`; y `apps/api/src/operacion/salud/dominio/sonda-dependencia.ts` con el puerto `SondaDependencia { comprobar(): Promise<void> }`
- [X] T030 [US2] Crear `apps/api/src/operacion/salud/aplicacion/consultar-salud.ts`: clase `ConsultarSalud(sondaBaseDeDatos, sondaCache, timeoutMs, version)` con `ejecutar(): Promise<EstadoSalud>` que lanza ambas sondas con `Promise.all`, cada una envuelta en `conTiempoLimite(promesa, timeoutMs)` (en `apps/api/src/operacion/salud/aplicacion/con-tiempo-limite.ts`, limpia el temporizador al terminar) y convierte rechazo o tiempo agotado en `'CAIDO'` (depende de T029)
- [X] T031 [P] [US2] Crear `apps/api/src/operacion/salud/infraestructura/sonda-postgres.ts` (`SondaPostgres` ejecuta ``prisma.$queryRaw`SELECT 1` ``) y `apps/api/src/operacion/salud/infraestructura/sonda-redis.ts` (`SondaRedis` ejecuta `redis.ping()` y exige `'PONG'`)
- [X] T032 [US2] Crear `apps/api/src/operacion/salud/presentacion/salud.controller.ts`: `@Get('salud')` que llama a `ConsultarSalud.ejecutar()`, fija `Cache-Control: no-store` y el código de `codigoHttpPara` (en `apps/api/src/operacion/salud/presentacion/codigo-http.ts`, porque los códigos HTTP son de la capa de presentación) (con `@Res({ passthrough: true })`), y devuelve el cuerpo tipado como `components['schemas']['Salud']` de `@licencias/contracts`
- [X] T033 [US2] Crear `apps/api/src/operacion/salud/salud.module.ts` que cablea con `useFactory` los tokens `SONDA_BASE_DE_DATOS` (→ `SondaPostgres`), `SONDA_CACHE` (→ `SondaRedis`) y `ConsultarSalud` (con `SALUD_TIMEOUT_MS` y `VERSION_SERVICIO` de la configuración); importarlo en `apps/api/src/app.module.ts`

**Punto de control**: T026–T028 pasan; `/api/v1/salud` cumple la tabla de [contracts/salud.md](./contracts/salud.md).

---

## Fase 4: Historia de usuario 1 – Levantar el sistema completo con un solo comando (Prioridad: P1) 🎯 MVP

**Objetivo**: `docker compose -f infra/docker-compose.yml up -d --build` deja `postgres`, `redis`, `api` y `web` en estado `healthy`, sin secretos ni pasos manuales, y se puede volver a levantar sin duplicar datos (FR-001 a FR-006).

**Prueba independiente**: en un clon limpio, ejecutar el comando único y comprobar los 4 servicios `healthy`; luego `down` + `up` y comprobar que hay 12 recetas.

### Pruebas de la historia 1 (escribir primero; deben fallar)

- [X] T034 [US1] Crear el script de humo `infra/prueba-humo.sh` (bash, `set -euo pipefail`): ejecuta el comando único, espera hasta 180 s a que los 4 servicios estén `healthy` (`docker compose -f infra/docker-compose.yml ps --format json`), comprueba `curl -fsS http://localhost:${PUERTO_API:-3000}/api/v1/salud` con `"estado":"OK"` y `curl -fsS http://localhost:${PUERTO_WEB:-8080}/` con HTTP 200; después `down` (sin `-v`), vuelve a levantar y verifica con `psql` dentro de `postgres` que `SELECT count(*) FROM catalogo.receta` = 12 y `SELECT count(*) FROM seguridad.rol` = 6 (FR-004)

### Implementación de la historia 1

- [X] T035 [P] [US1] Crear `.dockerignore` en la raíz que excluya `node_modules`, `**/dist`, `**/coverage`, `.git`, `.env`, `infra/.env`, `specs`, `.specify`, `.claude`, `tecnologia`, `docs/fuentes`, `docs/img`
- [X] T036 [P] [US1] Crear `apps/api/Dockerfile` multietapa (contexto = raíz): etapa `dependencias` (`node:24-alpine`, copia `package.json`, `package-lock.json` y los `package.json` de `apps/api` y `packages/contracts`, `npm ci -w apps/api -w packages/contracts --include-workspace-root`), etapa `build` (copia `docs/06-contrato-api/openapi.yaml`, `packages/contracts`, `apps/api`; `npm run generar`; `npm run build -w apps/api`), etapa final `node:24-alpine` con usuario no root, `NODE_ENV=production`, solo `dist/`, `prisma/` y dependencias de producción (incluido el CLI `prisma` para `migrate deploy`), `EXPOSE 3000`, `CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/main.js"]`
- [X] T037 [P] [US1] Crear `apps/web/Dockerfile` multietapa (contexto = raíz): build con `node:24-alpine` (`npm ci -w apps/web -w packages/contracts`, `npm run generar`, `npm run build -w apps/web`) y etapa final `nginx:1-alpine` que copia `apps/web/dist` y `apps/web/nginx.conf`; crear `apps/web/nginx.conf` con `location /api/ { proxy_pass http://api:3000; }`, `try_files $uri /index.html` para la SPA, `gzip on` y caché larga solo para `/assets/`
- [X] T038 [US1] Crear `infra/docker-compose.yml` (research.md §R-14): servicios `postgres` (`postgres:16-alpine`, `POSTGRES_USER: ${POSTGRES_USER:-licencias}`, `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-cambiar_en_produccion_solo_desarrollo}`, `POSTGRES_DB: ${POSTGRES_DB:-licencias}`, volumen nombrado `datos-postgres`, puerto `${PUERTO_POSTGRES:-5432}:5432`, healthcheck `pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}` cada 5 s), `redis` (`redis:7-alpine`, puerto `${PUERTO_REDIS:-6379}:6379`, healthcheck `redis-cli ping`), `api` (build `context: ..`, `dockerfile: apps/api/Dockerfile`; `DATABASE_URL` armada con las mismas variables y host `postgres`; `REDIS_URL: redis://redis:6379`; `depends_on` postgres y redis con `condition: service_healthy`; puerto `${PUERTO_API:-3000}:3000`; healthcheck `wget -qO- http://localhost:3000/api/v1/salud || exit 1` con `start_period: 30s`), `web` (build `apps/web/Dockerfile`, puerto `${PUERTO_WEB:-8080}:80`, `depends_on` api `service_healthy`, healthcheck `wget -qO- http://localhost/ || exit 1`). Todos los valores sensibles con valor por defecto de ejemplo, para que funcione sin `infra/.env`
- [X] T039 [US1] Agregar al `README.md` la sección "Cómo levantar el sistema" (FR-002): herramientas previas (Git, Docker con Compose v2, Node.js 24 para pruebas), comando único, cómo verificar (`/api/v1/salud` y http://localhost:8080), cómo detener (`down`) y reiniciar desde cero (`down -v`), cómo cambiar puertos ocupados (`cp .env.example infra/.env`), cómo ejecutar las pruebas (`npm test`, `npm run cobertura`, `npm run regla-dependencia`, `npm run contrato`) y la advertencia de que `.env.example` solo tiene valores ficticios
- [X] T040 [US1] Ejecutar `bash infra/prueba-humo.sh` y corregir hasta que pase completo dos veces seguidas

**Punto de control**: el sistema se levanta con un comando y el chequeo de salud responde `OK`; US1 y US2 funcionan juntas (MVP).

---

## Fase 5: Historia de usuario 3 – Ver el catálogo de licencias en el portal desde el celular (Prioridad: P2)

**Objetivo**: `GET /api/v1/catalogo/recetas` con cache-aside de 300 s y una página de inicio, primero celular, que lista las 9 licencias con nombre, tasa y plazo, con mensajes claros si falla o viene vacío.

**Prueba independiente**: con el sistema levantado, abrir http://localhost:8080 a 360 px de ancho y ver LIC-01 a LIC-09 con los valores de `datos-semilla.sql`; detener `api` y ver el mensaje de catálogo no disponible.

### Pruebas de la historia 3 (escribir primero; deben fallar)

- [ ] T041 [P] [US3] Pruebas unitarias de objetos de valor en `apps/api/test/unit/modulos/catalogo/dominio/`: `tasa.spec.ts` (`Tasa.desdeTexto('159.50').aTextoSoles() === '159.50'`, `'0.00'` válido, rechaza negativos, más de 2 decimales y texto no numérico; guarda céntimos enteros), `codigo-receta.spec.ts` (acepta `LIC-01`…`LIC-09`, `TRF-01`, `CGI-01`, `DUP-01`; rechaza `LIC-10`, `lic-01`, vacío), `plazo-dias-habiles.spec.ts` (acepta enteros > 0; rechaza 0, negativos y decimales)
- [ ] T042 [P] [US3] Prueba unitaria `apps/api/test/unit/modulos/catalogo/aplicacion/listar-recetas.spec.ts` con repositorio en memoria: pasa el filtro `tipo` al repositorio, devuelve DTO con `tasa` como texto (`LIC-09` → `"0.00"`), `ruta: null` y `plazoDias: null` para trámites conectados, y respeta el orden por código que entrega el repositorio
- [ ] T043 [P] [US3] Prueba unitaria `apps/api/test/unit/modulos/catalogo/infraestructura/repositorio-catalogo-con-cache.spec.ts` con Redis falso: acierto → devuelve lo guardado sin llamar al repositorio interno; fallo de caché → llama al interno y guarda con `set(clave, json, 'EX', 300)` usando la clave `catalogo:recetas:LICENCIA` o `catalogo:recetas:TODOS`; `get` que lanza error → usa el interno sin propagar el error; `set` que lanza error → igual devuelve el resultado
- [ ] T044 [P] [US3] Prueba de integración `apps/api/test/integracion/catalogo.e2e-spec.ts` (PostgreSQL migrado y Redis reales, borrando las claves `catalogo:recetas:*` antes de cada caso): `?tipo=LICENCIA` → 200 con exactamente `LIC-01`…`LIC-09` en orden y las tasas de `datos-semilla.sql` (`LIC-01` `"159.50"` plazo 2, `LIC-09` `"0.00"` plazo 5); sin filtro → 12 recetas; `?tipo=OTRO` → 422 `application/problem+json` con `errores[0].campo === 'tipo'`; cabecera `Cache-Control: public, max-age=300`; `esperarCumpleContrato` en todas las respuestas; EQ-06: actualizar `tasa` de LIC-01 a 160.00 con Prisma, borrar la clave de caché, volver a pedir y ver `"160.00"`, y restaurar 159.50
- [ ] T045 [P] [US3] Pruebas del portal `apps/web/src/paginas/Inicio.test.tsx` con `fetch` simulado: muestra "Cargando licencias…" (`role="status"`) mientras espera; con 9 recetas muestra 9 elementos de lista con nombre, `S/ 159.50` y `2 días hábiles`; con arreglo vacío muestra "Por ahora no hay licencias publicadas en el catálogo. Vuelva a intentarlo más tarde."; con error de red o respuesta ≠ 200 muestra "El catálogo no está disponible en este momento. Vuelva a intentarlo en unos minutos." (`role="alert"`) y el botón "Reintentar" vuelve a pedir; pide la URL `/api/v1/catalogo/recetas?tipo=LICENCIA` (contracts/portal-inicio.md)

### Implementación de la historia 3

- [ ] T046 [P] [US3] Crear el dominio del catálogo en `apps/api/src/modulos/catalogo/dominio/` (data-model.md §1): `tasa.ts` (`Tasa`, guarda céntimos enteros, "≥ 0 (0 = gratuito, LIC-09)", rechaza más de 2 decimales, `desdeTexto`, `desdeCentimos`, `aTextoSoles()` → `"305.90"`), `codigo-receta.ts` (patrón `^(LIC-0[1-9]|TRF-01|CGI-01|DUP-01)$`), `plazo-dias-habiles.ts` ("entero > 0 cuando existe"), `receta.ts` (`TipoReceta = 'LICENCIA' | 'TRAMITE_CONECTADO'`, `Ruta = 'A' | 'B' | 'C'`, `Receta { codigo; nombre (no vacío, ≤ 150 caracteres); tipo; ruta: Ruta | null (obligatoria si tipo = LICENCIA); tasa; plazoDias: PlazoDiasHabiles | null }`) y `repositorio-catalogo.ts` (puerto `RepositorioCatalogo { listarActivas(filtro: { tipo?: TipoReceta }): Promise<Receta[]> }`, ordenadas por código)
- [ ] T047 [US3] Crear `apps/api/src/modulos/catalogo/aplicacion/listar-recetas.ts`: caso de uso `ListarRecetas(repositorio)` con `ejecutar({ tipo? })` que devuelve `RecetaResumenDto[]` (tipo plano propio de la capa: `codigo`, `nombre`, `tipo`, `ruta`, `tasa` texto, `plazoDias`); no importa `@licencias/contracts` ni paquetes npm (depende de T046)
- [ ] T048 [P] [US3] Crear `apps/api/src/modulos/catalogo/infraestructura/repositorio-catalogo-postgres.ts`: consulta Prisma `receta.findMany({ where: { activa: true, tipo? }, orderBy: { codigo: 'asc' } })` y convierte `Decimal` → `Tasa.desdeTexto(decimal.toFixed(2))`
- [ ] T049 [P] [US3] Crear `apps/api/src/modulos/catalogo/infraestructura/repositorio-catalogo-con-cache.ts`: Decorator de `RepositorioCatalogo` con clave `catalogo:recetas:<TIPO|TODOS>`, TTL de `CATALOGO_CACHE_TTL_SEGUNDOS`, serialización JSON (tasa como texto) y degradación a la base si Redis falla, registrando solo "Caché del catálogo no disponible" (research.md §R-05)
- [ ] T050 [US3] Crear `apps/api/src/modulos/catalogo/presentacion/catalogo.controller.ts`: `@Get('catalogo/recetas')` que valida `tipo` (solo `LICENCIA` o `TRAMITE_CONECTADO`; otro valor → `ErrorValidacion([{ campo: 'tipo', mensaje: 'Debe ser LICENCIA o TRAMITE_CONECTADO' }])` → 422), fija `Cache-Control: public, max-age=300` y devuelve el resultado tipado como `components['schemas']['RecetaResumen'][]` de `@licencias/contracts`
- [ ] T051 [US3] Crear `apps/api/src/modulos/catalogo/catalogo.module.ts` (cablea con `useFactory`: `RepositorioCatalogoPostgres` → envuelto por `RepositorioCatalogoConCache` → `ListarRecetas`) y `apps/api/src/modulos/catalogo/fachada.ts` (única entrada pública para otros módulos: exporta `FachadaCatalogo` con `listarRecetas(filtro)` y los tipos `TipoReceta` y `RecetaResumenDto`); importar `CatalogoModule` en `apps/api/src/app.module.ts`
- [ ] T052 [P] [US3] Crear `apps/web/src/servicios/clienteApi.ts`: `createClient<paths>({ baseUrl: '/api/v1' })` de `openapi-fetch` y `listarLicencias(): Promise<RecetaResumen[]>` que pide `GET /catalogo/recetas` con `tipo: 'LICENCIA'`, aborta a los 10 s con `AbortController` y lanza error si la respuesta no es 200
- [ ] T053 [P] [US3] Crear `apps/web/src/componentes/formato.ts` (`formatearTasa(texto)` con `Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })` → `S/ 159.50`; `formatearPlazo(dias)` → `"N días hábiles"`, `1` → `"1 día hábil"`, `null` → `"Plazo no aplica"`) con prueba `apps/web/src/componentes/formato.test.ts`, y `apps/web/src/componentes/TarjetaLicencia.tsx` (`<li>` con nombre como `h2`, tasa y plazo)
- [ ] T054 [US3] Crear `apps/web/src/paginas/Inicio.tsx` con los estados cargando / lista / vacío / error y botón "Reintentar" según [contracts/portal-inicio.md](./contracts/portal-inicio.md) (un único `h1`, lista `<ul>`), y actualizar `apps/web/src/main.tsx` para renderizar `<Inicio />`; ningún nombre, tasa ni plazo escrito en el código (FR-016)
- [ ] T055 [P] [US3] Crear `apps/web/src/estilos/global.css` primero celular: `box-sizing: border-box`, `max-width: 100%` en elementos multimedia, tipografía base ≥ 16 px, una columna hasta 767 px y cuadrícula `repeat(auto-fill, minmax(18rem, 1fr))` desde 768 px, contraste AA, foco visible; importarlo en `apps/web/src/main.tsx`; verificar sin desplazamiento horizontal a 360 px (FR-014)

**Punto de control**: T041–T045 pasan; el portal muestra las 9 licencias y los mensajes de error/vacío.

---

## Fase 6: Historia de usuario 4 – Estructura de módulos y verificación automática en cada pull request (Prioridad: P2)

**Objetivo**: los 9 módulos con sus 4 capas existen, dependency-cruiser hace cumplir la regla de dependencia y cada PR ejecuta las 5 verificaciones (EQ-06).

**Prueba independiente**: abrir un PR de prueba con una importación prohibida y comprobar que el check `regla-dependencia` falla indicando archivo y regla; revertirla y comprobar que los 5 checks pasan.

### Pruebas de la historia 4 (escribir primero; deben fallar)

- [ ] T056 [P] [US4] Prueba `apps/api/test/unit/estructura-modulos.spec.ts`: `apps/api/src/modulos/` contiene exactamente `seguridad`, `catalogo`, `tramites`, `pagos`, `inspecciones`, `licencias`, `plazos`, `notificaciones`, `reportes`, y cada uno tiene `dominio`, `aplicacion`, `infraestructura` y `presentacion` (SC-009)
- [ ] T057 [P] [US4] Crear fixtures que violan cada regla en `apps/api/test/regla-dependencia/fixtures/src/modulos/` (dominio que importa `@nestjs/common`; dominio que importa su `infraestructura`; aplicación que importa `ioredis`; módulo `tramites` que importa `catalogo/dominio/receta.ts` en vez de `catalogo/fachada.ts`; ciclo entre dos archivos; y un import permitido a `catalogo/fachada.ts`) y la prueba `apps/api/test/regla-dependencia/regla-dependencia.spec.ts` que ejecuta `cruise()` de dependency-cruiser con `.dependency-cruiser.cjs` sobre los fixtures y espera exactamente una violación por regla (`dominio-sin-externos`, `dominio-sin-otras-capas`, `aplicacion-hacia-dentro`, `aislamiento-entre-modulos`, `sin-ciclos`) y ninguna para el import a la fachada

### Implementación de la historia 4

- [ ] T058 [US4] Crear las carpetas vacías de los 8 módulos restantes con `.gitkeep` en cada capa: `apps/api/src/modulos/{seguridad,tramites,pagos,inspecciones,licencias,plazos,notificaciones,reportes}/{dominio,aplicacion,infraestructura,presentacion}/.gitkeep`
- [ ] T059 [US4] Crear `.dependency-cruiser.cjs` con las reglas `forbidden` de severidad `error` de research.md §R-12: `dominio-sin-externos` (desde `^apps/api/src/(modulos|operacion)/[^/]+/dominio/` hacia `dependencyTypes: ['npm', 'npm-dev', 'core']`), `dominio-sin-otras-capas`, `aplicacion-hacia-dentro` (hacia `infraestructura/`, `presentacion/` o npm/core), `infraestructura-no-presentacion`, `aislamiento-entre-modulos` (desde `^apps/api/src/modulos/([^/]+)/` hacia `^apps/api/src/modulos/` con `pathNot: ['^apps/api/src/modulos/$1/', '^apps/api/src/modulos/[^/]+/fachada\\.ts$']`) y `sin-ciclos`; `options.tsConfig` apuntando a `apps/api/tsconfig.json` y `exclude` de `test/regla-dependencia/fixtures` para la ejecución normal; comprobar que `npm run regla-dependencia` pasa sobre `apps/api/src` y que T057 pasa
- [ ] T060 [US4] Crear `.github/workflows/ci.yml` según [contracts/ci-verificaciones.md](./contracts/ci-verificaciones.md): disparadores `pull_request` y `push` a `main`; Node 24 con `actions/setup-node` y caché de npm; 5 jobs con estos nombres exactos: `compilacion` (`npm ci`, `npm run generar`, `npm run typecheck`, `npm run lint`, `npm run formato`, `npm run build`), `pruebas` (servicios `postgres:16-alpine` y `redis:7-alpine` con healthchecks y las credenciales de ejemplo; `DATABASE_URL`/`REDIS_URL` hacia `localhost`; `npx prisma migrate deploy -w apps/api`; `npm test`), `cobertura` (`npm run cobertura`), `regla-dependencia` (`npm run regla-dependencia`), `contrato` (`npm run contrato`)
- [ ] T061 [US4] Agregar al `README.md` la sección "Verificaciones automáticas" con los 5 checks, qué revisa cada uno, cómo ejecutarlos en local y que sus nombres no deben cambiarse porque los exige la protección de `main`
- [ ] T062 [US4] Hacer push de la rama, abrir el PR de `001-esqueleto-sistema` hacia `main` y confirmar que los 5 checks terminan en verde; luego, en una rama temporal, agregar `import '@nestjs/common'` en `apps/api/src/modulos/catalogo/dominio/receta.ts`, comprobar que `regla-dependencia` falla indicando archivo y regla, y borrar la rama temporal (SC-007)

**Punto de control**: los 5 checks pasan en el PR y una violación intencional los hace fallar.

---

## Fase 7: Pulido y aspectos transversales

**Propósito**: verificaciones de calidad finales que abarcan varias historias.

- [ ] T063 [P] Ejecutar `docker run --rm -v "${PWD}:/repo" zricethezav/gitleaks:latest detect --source /repo --no-banner` (`${PWD}` funciona igual en PowerShell y en bash) y resolver cualquier hallazgo hasta tener 0 (FR-003, SC-002)
- [ ] T064 [P] Auditar http://localhost:8080 con Lighthouse en modo móvil y corregir en `apps/web/src/` hasta obtener accesibilidad ≥ 90 y buenas prácticas ≥ 90; anotar las puntuaciones en la sección de verificación del `README.md` (SC-006, EQ-05)
- [ ] T065 Ejecutar `npm run cobertura` y agregar pruebas en `apps/api/test/unit/` hasta que `dominio` y `aplicacion` superen el 80 % de líneas y ramas
- [ ] T066 Recorrer los 9 escenarios de [quickstart.md](./quickstart.md) en un clon limpio y corregir cualquier diferencia (incluye `docker stop` real de Redis y PostgreSQL para EQ-03 y el cambio de tasa para EQ-06)

---

## Fase 8: Cierre – protección de `main` (Historia 4, FR-019a)

**Propósito**: activar la protección **solo después** de que el CI haya corrido en verde al menos una vez (GitHub solo ofrece como checks requeridos los que ya se ejecutaron). Es la **última tarea** del plan.

- [ ] T067 [US4] Con T062 en verde, aplicar la protección con `gh api -X PUT repos/{owner}/{repo}/branches/main/protection` exigiendo `required_status_checks: { strict: true, contexts: ["compilacion","pruebas","cobertura","regla-dependencia","contrato"] }`, `required_pull_request_reviews: { required_approving_review_count: 0 }`, `enforce_admins: true`, `allow_force_pushes: false`, `allow_deletions: false`, `restrictions: null`; documentar en `README.md` (sección "Protección de main") el comando usado y cómo comprobarla; verificar que un `git push origin main` directo es rechazado. Confirmar con la responsable del repositorio antes de ejecutar el comando, porque cambia la configuración remota

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (fase 1)**: sin dependencias.
- **Base (fase 2)**: depende de la fase 1; bloquea todas las historias. T012 (contrato) va antes de cualquier código de la API.
- **US2 (fase 3)**: depende de la fase 2.
- **US1 (fase 4)**: depende de la fase 2 y de US2 (el healthcheck de `api` usa `/api/v1/salud`).
- **US3 (fase 5)**: depende de la fase 2; se puede hacer en paralelo con US2/US1. Su validación en el navegador usa Docker Compose (US1).
- **US4 (fase 6)**: T056–T059 dependen de la fase 2 y pueden ir en paralelo con US3; T059 necesita que exista `catalogo/fachada.ts` (T051) para su comprobación final; T060–T062 conviene hacerlos cuando US1–US3 estén listas, para que el primer CI verde cubra todo.
- **Pulido (fase 7)**: depende de US1–US4.
- **Cierre (fase 8)**: depende de T062 (CI verde) y es la última tarea.

### Dependencias entre historias

- **US2 (P1)**: independiente tras la fase 2.
- **US1 (P1)**: usa `/salud` de US2 para el healthcheck.
- **US3 (P2)**: independiente en la API; se integra con US1 para verse en el navegador.
- **US4 (P2)**: independiente; el CI cubre el código de todas las historias.

### Dentro de cada historia

- Pruebas primero (deben fallar) → dominio → aplicación → infraestructura → presentación → cableado del módulo.

### Oportunidades de paralelismo

- Fase 1: T002–T006, T008, T009 y T011 en paralelo (después de T001).
- Fase 2: T013, T014, T015, T017, T018, T019, T021, T023, T024 y T025 en paralelo tras T012; T016 después de T014; T020 después de T017–T019; T022 después de T020–T021.
- US2: T026–T028 juntas; T029 y T031 en paralelo.
- US1: T035–T037 en paralelo.
- US3: T041–T045 juntas; T046, T048, T049, T052, T053 y T055 en paralelo (T048/T049 una vez definido el puerto de T046).
- US4: T056 y T057 en paralelo.
- Pulido: T063 y T064 en paralelo.

---

## Ejemplos de ejecución en paralelo

### Historia 2

```bash
Tarea: "T026 Prueba unitaria de calcularEstadoGeneral en apps/api/test/unit/operacion/salud/estado-salud.spec.ts"
Tarea: "T027 Prueba unitaria de ConsultarSalud en apps/api/test/unit/operacion/salud/consultar-salud.spec.ts"
Tarea: "T028 Prueba de integración de /salud en apps/api/test/integracion/salud.e2e-spec.ts"
```

### Historia 1

```bash
Tarea: "T035 .dockerignore en la raíz"
Tarea: "T036 apps/api/Dockerfile"
Tarea: "T037 apps/web/Dockerfile y apps/web/nginx.conf"
```

### Historia 3

```bash
Tarea: "T041 Pruebas de Tasa, CodigoReceta y PlazoDiasHabiles"
Tarea: "T043 Prueba de RepositorioCatalogoConCache"
Tarea: "T044 Prueba de integración del catálogo"
Tarea: "T045 Pruebas de la página Inicio"
# Luego:
Tarea: "T052 clienteApi.ts"   Tarea: "T053 formato.ts y TarjetaLicencia.tsx"   Tarea: "T055 global.css"
```

### Historia 4

```bash
Tarea: "T056 Prueba de estructura de módulos"
Tarea: "T057 Fixtures y prueba de la regla de dependencia"
```

---

## Estrategia de implementación

### MVP primero (US2 + US1)

1. Fase 1 (preparación) y fase 2 (base).
2. Fase 3 (US2: chequeo de salud).
3. Fase 4 (US1: levantar con un comando).
4. **Parar y validar**: `bash infra/prueba-humo.sh` y los pasos 1, 2 y 5 de [quickstart.md](./quickstart.md).

### Entrega incremental

1. Base lista → US2 → US1 (MVP: el sistema arranca y se puede monitorear).
2. US3 → el portal muestra el catálogo (primera pieza visible para la Municipalidad).
3. US4 → estructura de módulos y CI con 5 verificaciones.
4. Pulido → secretos, Lighthouse, cobertura, quickstart completo.
5. Cierre → protección de `main`.

### Commits

Commits convencionales (`feat`, `fix`, `test`, `docs`, `chore`) por tarea o grupo lógico, por ejemplo
`docs(contrato): aclarar 503 de /salud y 422 del catálogo` para T012.

---

## Notas

- [P] = archivos distintos, sin dependencias pendientes.
- Cada tarea incluye o va acompañada de su prueba en el mismo PR (principio V).
- Detenerse en cada punto de control para validar la historia de forma independiente.
- Evitar: tareas vagas, conflictos en el mismo archivo y dependencias entre historias que rompan su independencia.
