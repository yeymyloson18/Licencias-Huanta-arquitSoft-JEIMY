# Plan de implementación: Tablero de jefatura, despliegue en la nube y pruebas del sistema completo

**Rama**: `007-tablero-despliegue` | **Fecha**: 2026-11-20 | **Especificación**: [spec.md](./spec.md)

**Entrada**: la especificación (con las aclaraciones del 2026-11-20) y la sección "Cómo construirlo" de
`docs/sdd/007-tablero-despliegue.md`.

## Resumen

Dos bloques de trabajo:

1. **Tablero y reportes (código de la aplicación)**:
   - Se completa el módulo `reportes`, que hoy está vacío. Su dominio es puro: promedios en días
     hábiles, porcentaje dentro del plazo, sumas en céntimos y armado del CSV.
   - Lee los datos solo por las fachadas de `tramites`, `pagos`, `licencias`, `plazos` y `catalogo`.
   - Guarda el resultado 5 minutos en Redis, y si Redis falla consulta directo.
   - Endpoints `GET /reportes/tablero` y `GET /reportes/licencias` (JSON y CSV).
   - En el portal, `/personal/tablero` con gráficos SVG accesibles, tablas, filtros y descarga.
   - `CalendarioHabil` y `titularPublico` pasan a `compartido/dominio` para que `reportes`, `plazos`,
     `licencias` y `tramites` usen las mismas reglas (research §R-03).
2. **Producción, pruebas del sistema y medición (infraestructura y documentación)**:
   - Compose de producción en `infra/produccion/` con estos servicios:
     - Caddy como punto de entrada. Además sirve el portal, que se hornea en la imagen del portal
       (research §R-05).
     - Dos servicios de API, `api-a` y `api-b`, para poder actualizarlos uno a la vez (research §R-06).
     - PgBouncer en modo transacción, PostgreSQL 16 y Redis 7.
   - Respaldo diario de la base y de los documentos, con su restauración probada.
   - Flujos de GitHub Actions:
     - `cd.yml`: despliegue con vuelta atrás.
     - `e2e.yml`: Playwright, en tamaño celular y de escritorio.
     - `k6.yml` y `calidad-produccion.yml`: a pedido.
   - Un comando para sembrar datos de demostración, que también usa E2E.
   - Guías en `docs/07-despliegue/`; ADR-008 y ADR-010 actualizados.

**Primero el contrato** (principio II): se ajustan `/reportes/tablero` y `/reportes/licencias` según
[contracts/openapi-cambios.md](./contracts/openapi-cambios.md). **Modelo de datos** (principio III):
no cambian las tablas. La migración `0011_indices_reportes` solo agrega índices
([data-model.md](./data-model.md)), lo que es compatible con la vuelta atrás (FR-035).

**Qué necesita el servidor real**: todo se construye y se prueba en local. Esto incluye el compose
de producción, que se levanta en un proyecto aislado con `DOMINIO=localhost` y certificado interno de
Caddy. Solo quedan para cuando la usuaria cree el droplet:

- el primer despliegue;
- la ejecución de k6, ZAP, Lighthouse y testssl contra la dirección pública;
- la aplicación del SUS.

Esas tareas se marcan **[servidor]** en `tasks.md` y quedan preparadas: flujos, scripts, guía y
plantillas de resultados.

**Dónde este plan se aparta de la entrada** (la constitución y la especificación prevalecen):

| Entrada | Plan | Motivo |
| --- | --- | --- |
| "Proxy de entrada" y "portal estático" como piezas separadas | Caddy sirve el portal desde su propia imagen | Un contenedor menos en 2 GB; el nginx de desarrollo no arranca sin un host `api` (research §R-05) |
| "2 réplicas de la API" | Dos servicios iguales `api-a` y `api-b` | Permite actualizar uno a la vez con Compose y volver atrás por servicio (research §R-06) |
| "Respaldo de PostgreSQL" | Base y volumen de documentos | Sin los documentos, un expediente restaurado queda incompleto (research §R-09) |
| Datos de demostración solo para la presentación | El mismo comando siembra los usuarios de E2E (`--salida` solo fuera de producción) | Una sola forma de crear usuarios de prueba, ya probada |
| k6 "con 1 y 2 réplicas" | El flujo `k6.yml` detiene `api-b` por SSH cuando se pide 1 réplica | La comparación se repite sin pasos manuales |
| `CalendarioHabil` en `plazos` | Pasa a `compartido/dominio` | `reportes` no puede importar el dominio de otro módulo (principio I) |

## Contexto técnico

**Lenguaje/versión**: TypeScript 5 estricto, Node.js 24 LTS (sin cambios).

**Dependencias principales**:

- Nuevas (desarrollo): `@playwright/test` 1.49.x. En local usa el Chrome instalado
  (`channel: 'chrome'`); en CI, el Chromium de Playwright.
- Sin dependencias nuevas de producción.
- Imágenes de producción, con versión fija:
  - `caddy:2.8-alpine` (con `caddy:2.8-builder-alpine` solo si hiciera falta un módulo; no hace
    falta);
  - `edoburu/pgbouncer:v1.23.1-p3`;
  - `postgres:16-alpine` y `redis:7-alpine`.
- Herramientas de los flujos: `grafana/k6:0.54.0`, `ghcr.io/zaproxy/zaproxy:stable` (baseline),
  `@lhci/cli` y `drwetter/testssl.sh:3.2`.

**Almacenamiento**:

- PostgreSQL: solo índices nuevos en `tramites`, `licencias` y `pagos`; sin tablas nuevas.
- Redis: caché `rep:*` con vida de 300 s.
- Respaldos en `/home/despliegue/respaldos` del servidor.

**Pruebas**:

- Jest: unidad para el dominio y la aplicación de `reportes`; integración con Supertest para el
  tablero, el reporte, el CSV, la caché, la matriz 401/403 y la privacidad.
- Testing Library: pruebas del portal.
- Playwright: E2E de las rutas A y B, en 360 px y escritorio.
- Pruebas de infraestructura en shell (`infra/produccion/verificar-local.sh`): levanta producción en
  local y comprueba lo siguiente:
  - cabeceras de caché y de seguridad, y compresión;
  - puertos;
  - caída de una réplica;
  - tope de conexiones de PgBouncer;
  - respaldo y restauración.

**Plataforma objetivo**:

- Desarrollo: Docker Compose (sin cambios).
- Producción: droplet de DigitalOcean de 2 GB con Ubuntu 24.04 LTS, Docker Engine y el plugin
  Compose.
- CI/CD: GitHub Actions y GHCR.

**Tipo de proyecto**: web (monorepo `apps/api`, `apps/web`, `packages/contracts`) más infraestructura.

**Metas de rendimiento**:

- Tablero ≤ 3 s con 10,000 expedientes (SC-001).
- EQ-01: p95 ≤ 2 s con 1,000 usuarios y menos del 1 % de errores (SC-007).
- EQ-02: comparación de 1 y 2 réplicas (SC-008).
- Despliegue ≤ 15 min (SC-012).
- TLS solo 1.3 (principio VII), con `protocols tls1.3` en Caddy (research §R-05).

**Restricciones**:

- Memoria total ≤ 2 GB, con límites por contenedor. Caddy 128 MB, cada API 384 MB, PgBouncer
  32 MB, PostgreSQL 512 MB y Redis 96 MB: total 1.5 GB, y el resto queda para el sistema.
- Solo los puertos 22, 80 y 443 abiertos.
- Sin secretos en el repositorio.
- Los 5 checks de CI no cambian de nombre.

**Escala**:

- Hasta 10,000 expedientes en el tablero.
- Reporte limitado a 5,000 filas.
- 1,000 usuarios simultáneos en la medición de carga.

## Verificación constitucional

| Principio | Cumplimiento |
| --- | --- |
| I. Monolito modular | `reportes` usa solo las fachadas de los otros módulos. El dominio de `reportes` es puro. Las reglas compartidas (`CalendarioHabil`, `titularPublico`) se mueven a `compartido/dominio`, que no depende de nada. dependency-cruiser lo comprueba |
| II. Contrato primero | Cambios en `openapi.yaml` antes del código, con `esperarCumpleContrato` en las pruebas de integración. El CSV se documenta como `text/csv` |
| III. Modelo por módulo | Sin tablas nuevas. `reportes` no tiene esquema propio porque no guarda datos. Migración `0011` solo con índices, también reflejados en `docs/05-modelo-de-datos/esquema.sql` |
| IV. TypeScript estricto | Sin `any`. Los montos se suman en céntimos enteros, nunca en `number` decimal (research §R-02) |
| V. Toda tarea con prueba | Cada tarea de código trae su prueba. Las de infraestructura tienen `verificar-local.sh`, y las de servidor, su comprobación documentada con comando y salida |
| VI. Escenarios EQ | EQ-01 y EQ-02 con k6 (`k6.yml`), EQ-03 con caída de réplica, respaldo y restauración, EQ-04 con matriz, privacidad, ZAP, testssl y cabeceras, y EQ-05 con Lighthouse y la plantilla SUS. Las mediciones en producción quedan **[servidor]** |
| VII. Datos personales | El tablero y el CSV llevan solo el titular público abreviado. La caché guarda claves con fechas, códigos de receta, giro y zona, nunca datos personales. La prueba de privacidad cubre las respuestas, el CSV, la caché y los registros. Los secretos viven solo en GitHub y en el `.env` del servidor (gitleaks) |
| VIII. Flujo Git | Rama propia y un commit convencional por fase. El CD solo corre después del CI verde en `main` |

**Restricciones tecnológicas**: la constitución pide "PostgreSQL con réplica síncrona y conmutación
automática". Con un solo droplet de 2 GB no se pone en marcha. Queda documentada como el siguiente
paso en ADR-008 y se justifica en "Seguimiento de complejidad".

## Estructura del proyecto

### Documentación

```text
specs/007-tablero-despliegue/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
├── contracts/
│   ├── openapi-cambios.md       # Cambios en /reportes/*
│   ├── portal-007.md            # Pantalla /personal/tablero
│   └── produccion.md            # Servicios, puertos, variables, cabeceras y flujos de CD
└── checklists/requirements.md

docs/07-despliegue/
├── README.md                    # Índice y estado de los criterios
├── guia-vps.md                  # Paso a paso para la usuaria (PowerShell y servidor)
├── dominio-cloudflare.md        # Cuando haya dominio (DNS, CDN, Full strict)
├── respaldo-restauracion.md     # Respaldo diario, bajar copias, restaurar
├── resultados.md                # k6, ZAP, Lighthouse, testssl, puertos (plantilla y resultados)
└── sus.md                       # Cuestionario SUS y cálculo del puntaje
```

### Código fuente

```text
apps/api/src/compartido/dominio/
├── calendario-habil.ts          # Movido desde plazos (sin cambios de comportamiento)
└── titular-publico.ts           # Movido desde licencias

apps/api/src/modulos/reportes/
├── dominio/
│   ├── rango-fechas.ts          # Validación (≤ 366 días) y mes actual por defecto
│   ├── atencion.ts              # Días hábiles de atención descontando suspensiones
│   ├── tablero.ts               # Conteos, promedios, % dentro del plazo, ingresos en céntimos
│   ├── csv.ts                   # Punto y coma, BOM, CRLF y escape de fórmulas
│   └── puertos.ts               # FuenteTramites, FuentePagos, FuenteLicencias, FuenteCatalogo, Feriados, Cache
├── aplicacion/
│   ├── obtener-tablero.ts
│   └── reporte-licencias.ts     # VIGENTES | EN_TRAMITE | ITSE_POR_VENCER, límite de 5,000
├── infraestructura/
│   ├── fuentes-fachadas.ts      # Adaptadores sobre las fachadas de los otros módulos
│   └── cache-redis.ts           # rep:* con 300 s; si Redis falla, sigue sin caché
├── presentacion/reportes.controller.ts
└── reportes.module.ts

apps/api/src/modulos/{tramites,pagos,licencias,plazos,catalogo}/fachada.ts   # Métodos nuevos de lectura
apps/api/src/scripts/sembrar-demostracion.ts    # Usuarios por rol y expedientes de ejemplo
apps/api/prisma/migrations/0011_indices_reportes/migration.sql

apps/web/src/paginas/personal/Tablero.tsx (+ test)
apps/web/src/componentes/GraficoBarras.tsx (+ test)   # SVG con <title>, descripción y tabla

infra/produccion/
├── docker-compose.yml           # caddy(portal), api-a, api-b, pgbouncer, postgres, redis
├── Caddyfile                    # {$DOMINIO}, caché, compresión, cabeceras, balanceo con salud
├── .env.ejemplo                 # Solo nombres de variables
├── desplegar.sh                 # Migraciones, actualización de una réplica a la vez, humo, vuelta atrás
├── respaldo.sh                  # pg_dump -Fc + documentos, 7 días
├── restaurar.sh                 # Restaura en una base aparte y compara conteos
├── verificar-local.sh           # Prueba de la configuración de producción en local
└── verificar-puertos.sh         # Comprobación desde fuera (se ejecuta en la PC de la usuaria)
apps/web/Dockerfile              # Etapa nueva `produccion` (Caddy + dist); la final sigue siendo nginx

.github/workflows/
├── ci.yml                       # Sin cambios en los 5 jobs
├── e2e.yml                      # Playwright contra infra/docker-compose.yml
├── cd.yml                       # workflow_run del CI en main → GHCR → SSH → desplegar.sh
├── k6.yml                       # workflow_dispatch: EQ-01 y EQ-02 (1 o 2 réplicas)
└── calidad-produccion.yml       # workflow_dispatch: ZAP baseline, Lighthouse móvil y testssl

tests/e2e/                       # playwright.config.ts, apoyo/, ruta-a.spec.ts, ruta-b.spec.ts
tests/carga/                     # eq01-catalogo.js, eq01-consulta.js (existentes), eq02-picos.js
```

**Decisión de estructura**: se mantiene el monorepo. Playwright vive en `tests/e2e/`, con su
configuración y una dependencia en la raíz, igual que `tests/carga/` (k6). Así no pasa por el
typecheck ni por la cobertura de `apps/*`, y tiene su propio `tsconfig`.

## Seguimiento de complejidad

| Desviación | Por qué hace falta | Alternativa más simple descartada porque |
| --- | --- | --- |
| No hay réplica síncrona con Patroni (la constitución la pide) | Un solo droplet de 2 GB, por decisión de la usuaria. Patroni necesita al menos 2 nodos de base y 3 de etcd | Poner Patroni en un solo servidor no da alta disponibilidad y consume memoria. Se cubre EQ-03 con 2 réplicas de la API, reinicio automático y respaldos diarios con restauración probada. ADR-008 queda con el siguiente paso |
| No hay CDN ni DNS de Cloudflare (criterio 10) | No hay dominio propio. sslip.io no se puede delegar a Cloudflare | Se deja la configuración lista: un solo valor, `DOMINIO`, y una guía paso a paso. ADR-010 indica qué parte queda pendiente |
| Dos servicios de API en lugar de `--scale api=2` | Hay que actualizar una réplica a la vez y volver atrás sin cortar | `--scale` recrea todas las réplicas a la vez con Compose |
