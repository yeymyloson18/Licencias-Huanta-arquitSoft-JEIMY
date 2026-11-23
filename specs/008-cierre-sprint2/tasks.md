# Tareas: Cierre del Sprint 2

**Entrada**: documentos de diseño en `specs/008-cierre-sprint2/`
**Requisitos previos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: obligatorias (constitución, principio V). En local solo corren lint, tipos, formato y
pruebas unitarias. Las pruebas de integración y las mediciones corren en GitHub Actions.

**[CI]**: la ejecución de la tarea ocurre en un flujo de GitHub Actions. La tarea queda hecha cuando el
flujo y sus scripts están escritos y validados en local donde se pueda (sintaxis, tipos).

**Abreviaturas**:

| Abreviatura | Ruta |
| --- | --- |
| `doc/` | `apps/api/src/operacion/documentacion/` |
| `s2/` | `docs/08-sprint-2/` |
| `wf/` | `.github/workflows/` |
| `ana/` | `tests/analisis/` |
| `car/` | `tests/carga/` |
| `pm/` | `tests/postman/` |

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Preparación

- [X] T001 Agregar `swagger-ui-dist` 5.17.14 y `yaml` 2.6.1 (versión exacta) a las dependencias de
  producción de `apps/api`. Comprobar que `npm ci` y el typecheck siguen en verde.
- [X] T002 [P] Crear las carpetas `s2/`, `pm/` y `ana/`, cada una con un README breve que explique para
  qué es.

---

## Fase 2: Historia de usuario 1 - Documentación interactiva de la API (P1) 🎯 MVP

**Prueba independiente**: con un módulo Nest mínimo, `/api/docs` responde 200,
`/api/docs/openapi.json` es igual al YAML y lleva la CSP de la documentación. Con `DOCS_API=false`,
responde 404.

- [X] T003 [P] [US1] Pruebas unitarias:
  - `test/unit/operacion/documentacion/contrato-api.spec.ts`: lee y convierte el YAML; un archivo que no
    existe o no es un objeto lanza un error claro;
  - `test/unit/compartido/configuracion.spec.ts`: `DOCS_API` por defecto `true`, `false` con
    `NODE_ENV=production`, y se puede forzar en cualquier entorno;
  - `test/unit/operacion/documentacion/documentacion.module.spec.ts`: Nest mínimo con Supertest para
    las rutas, la CSP, el JSON idéntico y el 404 cuando está apagada.
- [X] T004 [US1] Implementar:
  - `doc/contrato-api.ts`;
  - `doc/documentacion.module.ts`, con estáticos de `swagger-ui-dist`, `index.html` e
    `inicializador.js` propios (`validatorUrl: null`, sin código en línea) y la CSP de research §R-03;
  - en `openapi.yaml`, el servidor relativo `/api/v1` como primero de `servers` (research §R-01); luego
    `npm run contrato` y `npm run generar`;
  - `DOCS_API` y `DOCS_API_CONTRATO` en `configuracion.ts` y en `.env.example`;
  - el registro en `app.module.ts`, montado fuera de `/api/v1`.

  Deben pasar las pruebas de T003.
- [X] T005 [P] [US1] Cabeceras y despliegue:
  - `apps/web/nginx.conf` con `location /api/docs` y el snippet `apps/web/cabeceras-docs.conf`, copiado
    en `apps/web/Dockerfile`;
  - `infra/produccion/Caddyfile` con `handle /api/docs*`;
  - `apps/api/Dockerfile` copia `openapi.yaml` a la imagen final.

  Prueba `test/unit/operacion/documentacion/cabeceras-config.spec.ts`: lee esos archivos y comprueba
  que solo `/api/docs` tiene la CSP ajustada y que la estricta no cambió.
- [X] T006 [P] [US1] **[CI]** Prueba de integración `test/integracion/documentacion-api.e2e-spec.ts`
  con la aplicación completa: `/api/docs` responde 200, el JSON es igual al YAML y `/api/v1/salud`
  conserva sus cabeceras.
- [X] T007 [P] [US1] Enlace "Documentación de la API" en el portal: en el pie, solo si
  `VITE_DOCS_API !== 'false'`, con su prueba. También en el README del contrato.

**Punto de control**: el docente puede probar la API desde el navegador.

---

## Fase 3: Historia de usuario 3 - Reporte de cobertura publicado (P2)

- [ ] T008 [US3] Configurar la cobertura:
  - `apps/api/jest.config.ts` con `json-summary` en los reportes;
  - `apps/web`: script `cobertura` (`jest --coverage`, reportes `text`, `lcov` y `json-summary`, sin
    umbral).
- [ ] T009 [US3] En `wf/ci.yml`, el job `cobertura` (mismo nombre) agrega la cobertura del portal y
  `actions/upload-artifact` con `apps/api/coverage` y `apps/web/coverage`. Los otros 4 jobs no se tocan.
- [ ] T010 [P] [US3] `ana/resumen-cobertura.mjs`: lee los `coverage-summary.json` y genera la tabla por
  módulo y capa, con líneas y ramas. Ejecutarlo en local para obtener la tabla del README.

---

## Fase 4: Historia de usuario 4 - Recorrido de humo con Postman (P2)

- [ ] T011 [US4] `pm/licencias-huanta.postman_collection.json` generada con
  `npx openapi-to-postmanv2@4.20.1` (script `npm run postman:generar`), con `baseUrl` como variable.
- [ ] T012 [P] [US4] Archivos del humo:
  - `pm/humo.postman_collection.json` (public, 401, 403 de CAJA y 200 de JEFATURA, con
    `pm.test` y sin cuerpos con datos personales);
  - `pm/desarrollo.postman_environment.json`, con `baseUrl` y los tokens vacíos;
  - `pm/preparar-entorno.mjs`: siembra, ingresa con OTP y escribe un entorno temporal fuera del
    repositorio.
- [ ] T013 [US4] **[CI]** `wf/postman.yml`, que se dispara en `pull_request` y `workflow_dispatch`:
  1. levanta el compose y espera a que esté sano;
  2. prepara el entorno;
  3. ejecuta `npx newman@6 run … -r cli,htmlextra,junit`;
  4. sube el artefacto `newman` y baja el compose con `-v`.

---

## Fase 5: Historia de usuario 5 - Carga progresiva hasta 2,000 usuarios (P2)

- [ ] T014 [P] [US5] Scripts de carga:
  - `car/sprint2-progresivo.js`: etapas de 100 a 2,000, mezcla y umbrales de research §R-06, y pares
    `numero:documento`;
  - `car/cache-comparacion.js`: solo el catálogo, 50 usuarios durante 1 min.
- [ ] T015 [P] [US5] Apoyo de la carga:
  - `car/compose-carga.yml`: API sin puerto propio, `TRUST_PROXY_SALTOS=2` y reloj en 0;
  - `car/medir-recursos.sh`: `docker stats`, `INFO` de Redis y `pg_stat_activity` y
    `pg_stat_database` cada 10 s, en JSON por líneas;
  - `car/etapas.sh`: `jq` sobre la salida JSON de k6 para obtener p50, p95, errores y peticiones/s por
    etapa.
- [ ] T016 [US5] **[CI]** `wf/carga-sprint2.yml`, job `carga`:
  1. compose con `--scale api=2` y espera a que esté sano;
  2. siembra con `sembrar-demostracion`;
  3. arranca la medición de recursos;
  4. k6 progresivo con `|| true`, `--summary-export` y dashboard HTML;
  5. k6 del catálogo con Redis, `stop redis` y k6 del catálogo sin Redis;
  6. escribe `$GITHUB_STEP_SUMMARY` con la tabla por etapa y "umbral superado" donde corresponda;
  7. sube los artefactos y baja el compose.

---

## Fase 6: Historia de usuario 6 - Análisis de la base de datos (P3)

- [ ] T017 [P] [US6] `ana/sembrar-10000.sql` (data-model) y `ana/planes-consultas.sql`, con
  `EXPLAIN (ANALYZE, BUFFERS)` de las 6 consultas, copiadas del código y citando el archivo.
- [ ] T018 [US6] **[CI]** Job `planes-bd` en `wf/carga-sprint2.yml`:
  1. servicio `postgres:16-alpine`;
  2. `npm ci` y `prisma migrate deploy`;
  3. siembra y `ANALYZE`;
  4. planes;
  5. artefacto `planes.txt`.
- [ ] T019 [US6] `s2/base-de-datos.md`:
  - esquemas por módulo y por qué;
  - tabla de índices, con la consulta a la que sirve cada uno;
  - las 6 consultas con su SQL y el plan esperado (las salidas reales se pegan desde el artefacto);
  - transacciones y bloqueos con su archivo y el problema que evitan;
  - conexiones por réplica, con lo observado en la carga como pendiente del artefacto.

---

## Fase 7: Historias de usuario 7 y 8 - Caché, SOLID y patrones (P3)

- [ ] T020 [P] [US7] `s2/cache.md`:
  - tabla de claves (archivo, TTL e invalidación);
  - qué no se guarda y por qué;
  - qué pasa si Redis falla en lectura y en seguridad;
  - cabeceras `Cache-Control` del portal y de la API;
  - la medición (aciertos y p50 y p95 con y sin caché), pendiente del artefacto.
- [ ] T021 [P] [US8] `s2/solid-y-patrones.md`: SOLID con un ejemplo real por principio (archivo,
  fragmento y qué se perdería sin él), los 10 patrones con su archivo, el diagrama Mermaid de la regla
  de dependencia y el enlace al job `regla-dependencia`.
- [ ] T022 [US8] `ana/verificar-citas.mjs`: comprueba que cada archivo citado en `s2/*.md` existe y
  contiene la frase citada entre comillas invertidas, y que cada enlace relativo existe. Ejecutarlo en
  local.

---

## Fase 8: Historia de usuario 2 - Evidencias de calidad e informe del Sprint 2 (P1)

- [ ] T023 [US2] `s2/atributos-de-calidad.md`: una fila por EQ-01 a EQ-07, con estímulo, medida,
  herramienta, resultado, evidencia y estado, más el detalle por escenario. Usa los resultados de 003 a
  007 y deja como pendientes del artefacto los de 2,000 usuarios y Newman.
- [ ] T024 [US2] `s2/README.md`, el informe:
  - las 8 actividades y los 5 entregables con su evidencia;
  - arquitectura (estilo, enfoque y 9 módulos);
  - funcionalidades con sus historias de usuario;
  - cifras de pruebas y cobertura (con la tabla de T010);
  - limitaciones.
- [ ] T025 [US2] README principal con enlaces a `s2/`, a `/api/docs` y a los artefactos de los flujos.
  El diagrama de casos de uso no cambia.

---

## Fase 9: Acabado

- [ ] T026 Verificaciones en local: `lint`, `typecheck`, `formato`, `test:unit`, `cobertura` (≥ 80 %),
  `regla-dependencia`, `contrato`, `verificar-citas.mjs` y gitleaks. Sin integración local ni
  imágenes; las pruebas de integración y los flujos nuevos corren en GitHub Actions.

---

## Dependencias

- Fase 1 → Fase 2 (Swagger). Las fases 3 a 7 son independientes entre sí.
- La fase 8 (informe) va al final, porque enlaza a todo lo anterior.
- Commit al terminar cada fase.
