# Plan de implementación: Esqueleto del sistema

**Rama**: `001-esqueleto-sistema` | **Fecha**: 2026-11-17 | **Especificación**: [spec.md](./spec.md)

**Entrada**: especificación de `specs/001-esqueleto-sistema/spec.md` y stack indicado en
`docs/sdd/001-esqueleto-plan.md`.

## Resumen

Crear la base del monorepo (npm workspaces: `apps/api`, `apps/web`, `packages/contracts`) que se
levanta con un solo comando (`docker compose -f infra/docker-compose.yml up -d --build`) y deja en
marcha PostgreSQL 16, Redis 7, el backend NestJS y el portal React. El backend aplica dos
migraciones Prisma versionadas (esquema de `docs/05-modelo-de-datos/esquema.sql` y datos semilla de
`datos-semilla.sql`), expone `GET /api/v1/salud` (OK / DEGRADADO / CAIDO, 2 s de timeout por
dependencia) y `GET /api/v1/catalogo/recetas` (cache-aside en Redis, TTL 300 s). El portal muestra,
primero en celular, las 9 licencias del TUPA. Se crea la estructura vacía de los 9 módulos con sus 4
capas y un CI con 5 verificaciones (compilación, pruebas, cobertura, regla de dependencia y
contrato). La protección de `main` se activa al final, con el CI ya en verde.

**Correcciones previas al código** (contrato primero, principio II):

1. En `docs/06-contrato-api/openapi.yaml`, la descripción del `503` de `/salud` pasa a
   *"La base de datos no responde"*, y la del `200` aclara que también cubre `DEGRADADO` (solo
   falla la caché).
2. En el mismo cambio se declara `422` (`NoProcesable`) en `GET /catalogo/recetas` para un valor de
   `tipo` fuera del enum (ver [research.md](./research.md) §R-08).
3. La protección de `main` (FR-019a) es la **última tarea**, después de al menos una ejecución del CI
   en verde, y se documenta en el README.

## Contexto técnico

**Lenguaje/versión**: TypeScript 5.x con `"strict": true` sobre Node.js 24 LTS (backend, herramientas
y build del portal).

**Dependencias principales**: NestJS 11 (backend), Prisma ORM 6.x con `multiSchema` (acceso a datos y
migraciones), ioredis 5 (caché), React 19 + Vite (portal), openapi-typescript + openapi-fetch
(tipos y cliente del contrato), @redocly/cli (lint del contrato), dependency-cruiser (regla de
dependencia).

**Almacenamiento**: PostgreSQL 16 (un esquema por módulo, MD1) y Redis 7 (caché del catálogo).

**Pruebas**: Jest + ts-jest (unitarias de dominio y aplicación, y del portal con jsdom + Testing
Library), Supertest (integración de la API), Ajv 2020 contra `openapi.yaml` (validación de
respuestas, FR-020).

**Plataforma objetivo**: contenedores Linux (Docker Compose en desarrollo y CI); navegadores móviles
desde 360 px de ancho.

**Tipo de proyecto**: aplicación web (monorepo con backend API, portal SPA y paquete de contratos).

**Metas de rendimiento**: `/salud` responde en < 3 s aun con una dependencia colgada (SC-003; diseño:
sondas en paralelo con 2 s cada una); la página de inicio carga en < 3 s en conexión móvil típica
(SC-005).

**Restricciones**: sin secretos reales en el repositorio (FR-003); cobertura ≥ 80 % en `dominio` y
`aplicacion`; ninguna tasa, nombre ni plazo escritos en el código (FR-016); el sistema debe arrancar
aunque la base o la caché tarden más que el backend.

**Escala/alcance**: 1 instancia por componente en local; 9 módulos vacíos + 1 caso de uso de lectura
(catálogo) + 1 chequeo de salud; 1 página del portal.

## Verificación constitucional

*Puerta: debe pasar antes de la fase 0 y revisarse después de la fase 1.*

| Principio / puerta | Cómo lo cumple este plan | Estado |
|---|---|---|
| **I. Monolito modular con Clean Architecture** | 9 carpetas en `apps/api/src/modulos/` (`seguridad`, `catalogo`, `tramites`, `pagos`, `inspecciones`, `licencias`, `plazos`, `notificaciones`, `reportes`), cada una con `dominio/`, `aplicacion/`, `infraestructura/`, `presentacion/`. Solo `catalogo` tiene código. El chequeo de salud **no es un módulo de negocio**: vive en `apps/api/src/operacion/salud/` con las mismas 4 capas y las mismas reglas, por lo que no se enmienda la lista de 9 módulos. dependency-cruiser en CI. | ✅ |
| **II. Contrato primero** | Se corrige `openapi.yaml` (503 de `/salud`, 422 del filtro `tipo`) **antes** de programar. Los tipos del portal se generan del contrato. Las pruebas de integración validan respuestas contra el contrato. `redocly lint` en CI. | ✅ |
| **III. Modelo de datos por módulo** | Migración `0001` = `esquema.sql` sin cambios (9 esquemas, FK solo dentro del esquema); migración `0002` = `datos-semilla.sql`. Ningún cambio al modelo. El módulo `catalogo` solo lee `catalogo.receta`. Una prueba verifica que las migraciones coinciden con `docs/05-modelo-de-datos/`. | ✅ |
| **IV. TypeScript estricto y lenguaje del dominio** | `tsconfig.base.json` con `strict`, `noImplicitAny`, regla ESLint `@typescript-eslint/no-explicit-any: error`. Nombres en español: `Receta`, `Tasa`, `PlazoDiasHabiles`, `ListarRecetas`, `RepositorioCatalogo`, `EstadoSalud`. | ✅ |
| **V. Toda tarea incluye su prueba** | Jest + Supertest; umbral 80 % líneas y ramas en `**/dominio/**` y `**/aplicacion/**`; cada tarea de `tasks.md` llevará su prueba. | ✅ |
| **VI. Escenarios de calidad** | **EQ-03**: `/salud` con 3 estados, timeout acotado; verificación con `docker stop` del contenedor de Redis/PostgreSQL (quickstart). **EQ-05** (parcial): página de inicio auditada con Lighthouse ≥ 90 en accesibilidad y vista móvil (SC-006). **EQ-06**: cambio de tasa en la base visible en el portal sin tocar código; dependency-cruiser y GitHub Actions en cada PR. | ✅ |
| **VII. Protección de datos personales** | No se manejan datos personales. `/salud` no expone cadenas de conexión ni mensajes de error; los logs no imprimen `DATABASE_URL` ni `REDIS_URL`. | ✅ |
| **VIII. Flujo Git disciplinado** | Trabajo en `001-esqueleto-sistema`, commits convencionales, PR con CI en verde; protección de `main` como última tarea. | ✅ |
| **Puertas de CI (5)** | Jobs `compilacion`, `pruebas`, `cobertura`, `regla-dependencia`, `contrato` (ver [contracts/ci-verificaciones.md](./contracts/ci-verificaciones.md)). | ✅ |

**Módulos afectados**: `catalogo` (lectura de recetas); los otros 8 solo reciben su estructura vacía.
**Cambios en el contrato OpenAPI**: descripciones de `/salud` (200 y 503) y `422` en
`/catalogo/recetas`. **Cambios en el modelo de datos**: ninguno. **Datos personales**: ninguno.

**Resultado de la puerta (antes de la fase 0)**: aprobada, sin excepciones.
**Revisión después de la fase 1**: aprobada; el diseño de [data-model.md](./data-model.md) y
[contracts/](./contracts/) no introduce violaciones.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/001-esqueleto-sistema/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas
├── data-model.md        # Fase 1: entidades y reglas
├── quickstart.md        # Fase 1: guía de validación de punta a punta
├── contracts/           # Fase 1: contratos de interfaz
│   ├── salud.md
│   ├── catalogo-recetas.md
│   ├── portal-inicio.md
│   └── ci-verificaciones.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Código fuente (raíz del repositorio)

```text
package.json                     # workspaces: apps/*, packages/*; scripts de calidad globales
tsconfig.base.json               # strict compartido
.eslintrc / eslint.config.mjs    # ESLint + typescript-eslint
.prettierrc
.dependency-cruiser.cjs          # regla de dependencia y aislamiento entre módulos
redocly.yaml                     # reglas de lint del contrato
.env.example                     # solo valores ficticios de desarrollo
.github/workflows/ci.yml         # 5 verificaciones

infra/
└── docker-compose.yml           # postgres, redis, api, web (con healthchecks)

packages/contracts/
├── package.json                 # script "generar": openapi-typescript → src/generado/api.d.ts
└── src/
    ├── generado/                # (ignorado por git; se regenera en cada build)
    └── index.ts                 # reexporta paths/components

apps/api/
├── Dockerfile                   # multi-etapa; arranque: prisma migrate deploy && node dist/main.js
├── prisma/
│   ├── schema.prisma            # datasource con schemas = [comun, seguridad, catalogo, ...]
│   └── migrations/
│       ├── 0001_esquema_inicial/migration.sql   # copia de docs/05-modelo-de-datos/esquema.sql
│       └── 0002_datos_semilla/migration.sql     # copia de docs/05-modelo-de-datos/datos-semilla.sql
├── src/
│   ├── main.ts                  # prefijo /api/v1, filtro problem+json
│   ├── app.module.ts
│   ├── compartido/infraestructura/   # PrismaServicio, clienteRedis, configuración (env)
│   ├── operacion/salud/
│   │   ├── dominio/             # EstadoSalud, calcularEstadoGeneral()
│   │   ├── aplicacion/          # ConsultarSalud (sondas con timeout)
│   │   ├── infraestructura/     # SondaPostgres, SondaRedis
│   │   └── presentacion/        # SaludController
│   └── modulos/
│       ├── catalogo/
│       │   ├── dominio/         # Receta, Tasa, PlazoDiasHabiles, TipoReceta, RepositorioCatalogo (puerto)
│       │   ├── aplicacion/      # ListarRecetas
│       │   ├── infraestructura/ # RepositorioCatalogoPostgres, RepositorioCatalogoConCache
│       │   ├── presentacion/    # CatalogoController, DTO de salida
│       │   ├── catalogo.module.ts
│       │   └── fachada.ts       # única entrada pública para otros módulos
│       ├── seguridad/      {dominio,aplicacion,infraestructura,presentacion}/.gitkeep
│       ├── tramites/       {…}/.gitkeep
│       ├── pagos/          {…}/.gitkeep
│       ├── inspecciones/   {…}/.gitkeep
│       ├── licencias/      {…}/.gitkeep
│       ├── plazos/         {…}/.gitkeep
│       ├── notificaciones/ {…}/.gitkeep
│       └── reportes/       {…}/.gitkeep
└── test/
    ├── unit/                    # dominio y aplicación (sin red ni base)
    ├── integracion/             # Supertest + validación contra openapi.yaml
    └── apoyo/validarContrato.ts # Ajv 2020 sobre docs/06-contrato-api/openapi.yaml

apps/web/
├── Dockerfile                   # build Vite → nginx; proxy /api → api:3000
├── nginx.conf
├── index.html
└── src/
    ├── main.tsx
    ├── paginas/Inicio.tsx       # estados: cargando, lista, vacío, error
    ├── componentes/TarjetaLicencia.tsx
    ├── servicios/clienteApi.ts  # openapi-fetch tipado con @licencias/contracts
    └── estilos/                 # CSS primero celular
    (pruebas en src/**/*.test.tsx)
```

**Decisión de estructura**: monorepo con npm workspaces, tal como indica la entrada. Los nombres de
las carpetas de módulos coinciden con los esquemas de `esquema.sql` (y `reportes`, que no tiene
esquema propio porque lee mediante fachadas). El chequeo de salud va en `src/operacion/` para no
crear un décimo módulo.

## Seguimiento de complejidad

No hay violaciones de la constitución que justificar.
