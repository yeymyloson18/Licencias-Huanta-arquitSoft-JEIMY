# Plan de implementación: Cierre del Sprint 2

**Rama**: `008-cierre-sprint2` | **Fecha**: 2026-11-22 | **Especificación**: [spec.md](./spec.md)

**Entrada**: la especificación (con las aclaraciones del 2026-11-22) y la sección "Cómo construirlo" de
`docs/sdd/008-cierre-sprint2.md`.

## Resumen

Sin funciones de negocio nuevas. Se agregan cinco cosas.

1. **Swagger UI** servido por la propia API en `/api/docs`, con el contrato en
   `/api/docs/openapi.json`. Ambos se leen al arrancar del mismo `docs/06-contrato-api/openapi.yaml`.
   - Usa `swagger-ui-dist` como archivos estáticos locales y `yaml` para convertir el contrato a JSON.
   - Solo la ruta de la documentación lleva una CSP propia. Se ajustan `apps/web/nginx.conf` y el
     `Caddyfile` sin tocar las cabeceras del resto.
   - Por defecto queda apagado en producción (`DOCS_API`).
2. **Postman y Newman**:
   - una colección completa generada desde el contrato;
   - una colección de humo escrita a mano, con pruebas;
   - un entorno sin secretos;
   - el flujo `postman.yml`, que corre en cada PR y a pedido y deja un informe HTML.
3. **Cobertura publicada**: el job `cobertura` sube como artefacto el HTML y el lcov de la API y del
   portal. Un script genera la tabla por módulo y capa para el README.
4. **Mediciones pesadas en GitHub Actions** (`carga-sprint2.yml`, a pedido):
   - Job `carga`: compose de desarrollo con 2 réplicas de la API, siembra, k6 progresivo hasta 2,000
     usuarios y comparación del catálogo con y sin Redis. Registra el uso de recursos de los
     contenedores, de Redis y de PostgreSQL.
   - Job `planes-bd`: solo PostgreSQL y las migraciones, siembra 10,000 expedientes y obtiene los
     `EXPLAIN (ANALYZE, BUFFERS)` de las 6 consultas críticas.
5. **Documentos del Sprint 2** en `docs/08-sprint-2/`:
   - `README.md`: el informe;
   - `base-de-datos.md`;
   - `cache.md`;
   - `solid-y-patrones.md`;
   - `atributos-de-calidad.md`.

   Más los enlaces desde el README principal y desde el portal.

**Lo que no se ejecuta en local** (por la memoria del equipo): no se construyen imágenes, no se levanta
el sistema completo, no corre k6 ni Newman. Los planes de consulta tampoco se obtienen en local. Todo
eso queda en los flujos. En local solo corren lint, tipos, formato, pruebas unitarias y la prueba de
integración de Swagger, que es liviana y usa los contenedores temporales `pg-pruebas-008` y
`redis-pruebas-008`. Los documentos se escriben con el análisis del código y con los resultados ya
obtenidos. Las cifras que salen de los flujos quedan como "pendiente de la ejecución del flujo", con
la instrucción para completarlas.

**Dónde este plan se aparta de la entrada**:

| Entrada | Plan | Motivo |
| --- | --- | --- |
| Un solo flujo de carga | Dos jobs en `carga-sprint2.yml` (`carga` y `planes-bd`) | Aclaración: los planes no necesitan el sistema completo; corren en paralelo y con menos recursos |
| "Latencia con y sin caché" | Segunda pasada corta solo del catálogo con Redis detenido | Es la única forma honesta de medir "sin caché" sin cambiar código, y además prueba que la lectura sigue desde PostgreSQL |
| La carga pasa por nginx con 2 réplicas | En el compose de carga, `TRUST_PROXY_SALTOS=2` | Cada usuario virtual simula su origen. Si no, todos comparten la IP de k6 y se mide el límite de intentos, no el sistema (research §R-06) |

## Contexto técnico

**Lenguaje/versión**: TypeScript 5 estricto, Node.js 24 LTS.

**Dependencias nuevas**:

- `apps/api`, de producción: `swagger-ui-dist` 5.17.14 (archivos estáticos) y `yaml` 2.6.1 (leer el
  contrato).
- En los flujos, sin instalarse en el repositorio: `newman@6` y `newman-reporter-htmlextra`;
  `openapi-to-postmanv2@4.20.1` (con `npx` al generar la colección); `grafana/k6:0.54.0`.

**Almacenamiento**: sin cambios. Sin migraciones.

**Pruebas**:

- Jest: unidad de `leerContratoApi` y de la configuración `DOCS_API`; integración de `/api/docs`.
- Prueba unitaria que lee `nginx.conf` y el `Caddyfile` y comprueba que la ruta de la documentación
  tiene su propia CSP y que el resto mantiene la estricta.
- Newman: humo.
- k6: carga.
- SQL: planes de consulta.

**Plataforma objetivo**: ejecutores `ubuntu-latest` de GitHub Actions para las mediciones. Docker
Compose de desarrollo, con un archivo de ajustes para la carga.

**Metas**: EQ-01, con p95 < 2 s y errores < 1 % hasta 2,000 usuarios (se informa tal como salga).
Cobertura de dominio y aplicación ≥ 80 %.

**Restricciones**: sin secretos en el repositorio. Los 5 checks no cambian de nombre. Sin construir
imágenes en local.

## Verificación constitucional

| Principio | Cumplimiento |
| --- | --- |
| I. Monolito modular | Swagger vive en `src/operacion/documentacion/`, fuera de los módulos de negocio, igual que la salud. No toca dominios |
| II. Contrato primero | El contrato es la única fuente: Swagger lo lee tal cual y la prueba compara el JSON servido con el YAML. El contrato no cambia, porque las rutas `/api/docs` no son parte de la API de negocio (research §R-02) |
| III. Modelo por módulo | Sin cambios en la base. El análisis solo lee. La siembra de 10,000 expedientes corre en un PostgreSQL efímero del ejecutor |
| IV. TypeScript estricto | Sin `any`. El YAML se valida como objeto antes de servirlo |
| V. Toda tarea con prueba | Swagger con pruebas de unidad e integración. Las cabeceras con una prueba de configuración. Los flujos y scripts se validan al ejecutarse en el CI. Los documentos se revisan contra los archivos citados |
| VI. Escenarios EQ | `atributos-de-calidad.md` cubre de EQ-01 a EQ-07 con la herramienta del documento de escenarios: k6, Jest y Supertest, ZAP, Lighthouse, dependency-cruiser y Newman |
| VII. Datos personales | La documentación usa solo los ejemplos ficticios del contrato. Las cargas usan datos ficticios sembrados en el ejecutor. Los informes de k6 y Newman no imprimen cuerpos con datos personales |
| VIII. Flujo Git | Rama propia y un commit por fase. Los flujos nuevos no se suman a los checks obligatorios |

## Estructura del proyecto

### Documentación

```text
specs/008-cierre-sprint2/   spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
  contracts/documentacion-api.md      # /api/docs, /api/docs/openapi.json, DOCS_API y CSP
  contracts/flujos-sprint2.md         # postman.yml, carga-sprint2.yml y artefactos
docs/08-sprint-2/
  README.md                           # informe del Sprint 2 (actividades, entregables, cifras y limitaciones)
  atributos-de-calidad.md             # EQ-01 a EQ-07
  base-de-datos.md                    # esquemas, índices, planes, bloqueos y conexiones
  cache.md                            # claves, TTL, invalidación, fallos, cabeceras y medición
  solid-y-patrones.md                 # SOLID con ejemplos, patrones y regla de dependencia
```

### Código y flujos

```text
apps/api/src/operacion/documentacion/
  contrato-api.ts                     # lee y convierte openapi.yaml (función pura, con prueba unitaria)
  documentacion.module.ts             # monta /api/docs (estáticos) y /api/docs/openapi.json si DOCS_API
apps/api/src/compartido/infraestructura/configuracion.ts   # DOCS_API (por defecto true salvo NODE_ENV=production) y DOCS_API_CONTRATO
apps/api/Dockerfile                   # copia openapi.yaml a la imagen final
apps/web/nginx.conf + cabeceras-docs.conf     # location /api/docs con su CSP
infra/produccion/Caddyfile            # handle /api/docs* con su CSP (apagado por defecto)
apps/web/src/componentes/PiePagina    # enlace "Documentación de la API" (o en el menú existente)

tests/postman/
  licencias-huanta.postman_collection.json     # generada desde el contrato
  humo.postman_collection.json                 # recorrido de humo con pruebas
  desarrollo.postman_environment.json          # baseUrl y tokens vacíos
  preparar-entorno.mjs                         # en el ejecutor: siembra usuarios, ingresa y escribe tokens
tests/carga/
  sprint2-progresivo.js                        # 100 → 500 → 1,000 → 1,500 → 2,000
  cache-comparacion.js                         # catálogo con y sin Redis
  compose-carga.yml                            # 2 réplicas, sin puerto propio de la API, TRUST_PROXY_SALTOS=2
  medir-recursos.sh                            # docker stats, INFO de Redis y estadísticas de PostgreSQL
tests/analisis/
  sembrar-10000.sql                            # 10,000 expedientes ficticios, historial, esquelas y eventos
  planes-consultas.sql                         # EXPLAIN (ANALYZE, BUFFERS) de las 6 consultas
  resumen-cobertura.mjs                        # coverage-summary.json → tabla por módulo y capa
.github/workflows/
  ci.yml                                       # job cobertura: + portal y + artefactos (sin renombrar)
  postman.yml                                  # Newman en PR y a pedido
  carga-sprint2.yml                            # jobs carga y planes-bd (a pedido)
```

## Seguimiento de complejidad

| Desviación | Por qué hace falta | Alternativa descartada |
| --- | --- | --- |
| Dos dependencias de producción nuevas en la API | Swagger UI necesita sus archivos, y el contrato es YAML | Copiar los archivos de Swagger al repositorio: miles de líneas sin versión. Un CDN de terceros: obliga a abrir la CSP. `js-yaml` también serviría; `yaml` ya está en el árbol por Redocly |
| `TRUST_PROXY_SALTOS=2` en el compose de carga | Medir el sistema y no el límite de intentos por origen | Desactivar el límite por configuración: cambiaría el código de seguridad |
