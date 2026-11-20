# Tareas: Tablero de jefatura, despliegue en la nube y pruebas del sistema completo

**Entrada**: documentos de diseño en `specs/007-tablero-despliegue/`
**Requisitos previos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: obligatorias (constitución, principio V). En cada historia, las pruebas se escriben antes
que la implementación y deben fallar primero.

**[servidor]**: la tarea necesita el droplet real. Queda preparada (flujo, script, guía o plantilla)
y se ejecuta cuando la usuaria cree el servidor. No se marca como hecha hasta entonces.

**Abreviaturas de rutas**:

| Abreviatura | Ruta |
| --- | --- |
| `rep/` | `apps/api/src/modulos/reportes/` |
| `tra/` | `apps/api/src/modulos/tramites/` |
| `pag/` | `apps/api/src/modulos/pagos/` |
| `lic/` | `apps/api/src/modulos/licencias/` |
| `pla/` | `apps/api/src/modulos/plazos/` |
| `cat/` | `apps/api/src/modulos/catalogo/` |
| `com/` | `apps/api/src/compartido/` |
| `test-rep/` | `apps/api/test/unit/modulos/reportes/` |
| `int/` | `apps/api/test/integracion/` |
| `web/` | `apps/web/src/` |
| `prod/` | `infra/produccion/` |
| `wf/` | `.github/workflows/` |
| `dep/` | `docs/07-despliegue/` |

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes).
- **[US1]…[US7]**: historia de usuario de [spec.md](./spec.md).

---

## Fase 1: Preparación

- [X] T001 Mover `pla/dominio/calendario-habil.ts` a `com/dominio/calendario-habil.ts` y
  `lic/dominio/titular-publico.ts` a `com/dominio/titular-publico.ts` (research §R-03). Además:
  - actualizar los imports en `plazos` y `licencias`;
  - mover sus pruebas a `apps/api/test/unit/compartido/`.

  Unidad, cobertura y regla de dependencia deben seguir en verde.
- [X] T002 [P] Crear `rep/reportes.module.ts` (vacío), registrarlo en `apps/api/src/app.module.ts` y
  quitar los `.gitkeep` de `rep/`.
- [X] T003 [P] Agregar `@playwright/test` (1.49.x) como dependencia de desarrollo de la raíz y crear:
  - `tests/e2e/playwright.config.ts`, con los proyectos `celular` (360×740, `isMobile`) y
    `escritorio` (1280×800), `channel: 'chrome'` fuera de CI y `trace`, `video` y `screenshot` solo
    si falla;
  - `tests/e2e/tsconfig.json`;
  - el script `npm run e2e`.

  `tests/e2e/` queda fuera del typecheck y la cobertura de `apps/*`, con ESLint y Prettier aplicados
  (research §R-11).

---

## Fase 2: Fundamentos (bloquea las historias 1 y 2)

- [X] T004 Contrato primero: aplicar [contracts/openapi-cambios.md](./contracts/openapi-cambios.md) en
  `docs/06-contrato-api/openapi.yaml` y en su README. Después:
  - ejecutar `npm run contrato` (sin advertencias nuevas);
  - ejecutar `npm run generar`.
- [X] T005 [P] Migración `apps/api/prisma/migrations/0011_indices_reportes/migration.sql` con los 4
  índices de [data-model.md](./data-model.md) §2. Reflejarlos en `docs/05-modelo-de-datos/esquema.sql`
  y `schema.prisma` (`@@index`). La prueba de esquema equivalente debe seguir en verde.
- [X] T006 Métodos de lectura en las fachadas ([data-model.md](./data-model.md) §3), con sus puertos y
  repositorios:

  | Fachada | Métodos |
  | --- | --- |
  | `tra/fachada.ts` | `conteoPorEstado`, `atencionesTerminadas`, `expedientesEnTramite` (titular abreviado con `titularPublico`) |
  | `pag/fachada.ts` | `pagosRegistrados` |
  | `lic/fachada.ts` | `licenciasVigentes`, `itsePorVencer` |
  | `pla/fachada.ts` | `feriadosEntre` |
  | `cat/fachada.ts` | se reutiliza `listarRecetas({ tipo: 'LICENCIA' })`, que ya devuelve `plazoDias` |

  Incluye pruebas unitarias de los cálculos nuevos en cada módulo (suspensiones a partir del
  historial).

---

## Fase 3: Historia de usuario 1 - Tablero de la jefatura (Prioridad: P1) 🎯 MVP

**Objetivo**: `GET /reportes/tablero` y `/personal/tablero` con conteos, tiempos frente al plazo e
ingresos.

**Prueba independiente**: con datos sembrados en fechas conocidas, el tablero coincide con el cálculo
a mano (SC-002).

### Pruebas de la historia 1

- [X] T007 [P] [US1] Pruebas unitarias en `test-rep/dominio/` de:
  - `RangoFechas`: mes actual, más de 366 días, `desde > hasta`, fechas inválidas;
  - `Atencion`: suspensiones recortadas, feriados, misma fecha = 0;
  - `Tablero`: promedios con un decimal, plazo 0 → `null`, receta sin atendidos → `null`;
  - `Centimos`: `"0.10" + "0.20" = "0.30"`, formato inválido.
- [X] T008 [P] [US1] Pruebas unitarias en `test-rep/aplicacion/obtener-tablero.spec.ts`:
  - usa la caché si existe;
  - guarda 300 s;
  - con Redis caído calcula igual;
  - un solo `CalendarioHabil` por consulta.
- [X] T009 [P] [US1] Prueba de integración `int/reportes-tablero.e2e-spec.ts`:
  - siembra expedientes, historial con observación y pago, esquelas pagadas y feriados;
  - comprueba conteos, promedios, porcentaje e ingresos exactos;
  - sin fechas → mes actual;
  - 422 en los tres casos inválidos;
  - `Cache-Control: no-store`;
  - segunda llamada servida desde `rep:tablero:*`;
  - con Redis detenido simulado (adaptador que falla) responde 200;
  - otros roles 403 y sin sesión 401;
  - respuestas validadas con `esperarCumpleContrato`.

### Implementación de la historia 1

- [X] T010 [US1] `rep/dominio/` (`rango-fechas.ts`, `tablero.ts` con los días de atención, `puertos.ts`) y
  `rep/aplicacion/obtener-tablero.ts`. Deben pasar T007 y T008.
- [X] T011 [US1] Infraestructura y presentación:
  - `rep/infraestructura/fuentes-fachadas.ts` y `cache-redis.ts`;
  - `rep/presentacion/reportes.controller.ts` (`GET /reportes/tablero`, JEFATURA);
  - cableado en `rep/reportes.module.ts`.

  Debe pasar T009.
- [X] T012 [P] [US1] Portal:
  - `web/componentes/GraficoBarras.tsx` (SVG accesible con `<title>`, resumen y tabla), con su prueba;
  - `web/servicios/clienteApi.ts` `obtenerTablero`;
  - `web/paginas/personal/Tablero.tsx` (rango, tres secciones, estados), con su prueba;
  - ruta `/personal/tablero` (JEFATURA) y opción "Tablero" en el menú, con su prueba
    ([contracts/portal-007.md](./contracts/portal-007.md)).

**Punto de control**: la jefatura ve su tablero.

---

## Fase 4: Historia de usuario 2 - Reporte de licencias y CSV (Prioridad: P1)

**Objetivo**: `GET /reportes/licencias` en JSON y CSV, y la sección del reporte en el portal.

**Prueba independiente**: las filas de cada situación coinciden con lo sembrado y el CSV abre bien en
una hoja de cálculo.

### Pruebas de la historia 2

- [X] T013 [P] [US2] Pruebas unitarias:
  - `test-rep/dominio/csv.spec.ts`: BOM, `;`, CRLF, comillas, saltos de línea, `=cmd` → `'=cmd`, tildes;
  - `test-rep/aplicacion/reporte-licencias.spec.ts`: 3 situaciones, límite de 5,000 + truncado,
    caché.
- [X] T014 [P] [US2] Prueba de integración `int/reportes-licencias.e2e-spec.ts`:
  - vigentes por giro;
  - en trámite;
  - ITSE por vencer ordenado;
  - filtros sin importar mayúsculas ni tildes;
  - CSV con `Content-Type`, `Content-Disposition` y la misma cantidad de filas que el JSON;
  - `X-Reporte-Truncado` con más de 5,000 filas (sembradas en bloque);
  - 422;
  - 401 y 403;
  - contrato.

### Implementación de la historia 2

- [X] T015 [US2] `rep/dominio/csv.ts`, `rep/aplicacion/reporte-licencias.ts` y
  `GET /reportes/licencias` en el controlador (JSON o `text/csv` según `formato`, con la cabecera de
  truncado). Deben pasar T013 y T014.
- [X] T016 [P] [US2] Portal:
  - sección "Reporte de licencias" en `web/paginas/personal/Tablero.tsx`, con filtros, tabla, aviso de
    truncado y "Descargar CSV";
  - `clienteApi.ts` (`reporteLicencias` y `descargarCsv`);
  - sus pruebas.

**Punto de control**: tablero y reporte completos (HU10, RF18 y RF19).

---

## Fase 5: Historia de usuario 3 - Recorridos E2E en el navegador (Prioridad: P2)

**Objetivo**: Playwright con las rutas A y B completas, en celular y en escritorio, en CI.

**Prueba independiente**: `npm run e2e` contra el compose de desarrollo pasa los 4 casos (2 rutas × 2
proyectos).

- [ ] T017 [US3] Comando `apps/api/src/scripts/sembrar-demostracion.ts` (research §R-12):
  - un usuario por rol (`demo.<rol>@ejemplo.pe`) con una clave aleatoria;
  - 3 expedientes de ejemplo (rutas A, B y C);
  - es idempotente y acepta `--regenerar`;
  - `--salida -` imprime JSON y se rechaza con `NODE_ENV=production`;
  - las claves nunca van al logger ni a archivos.

  Se compila a `dist/scripts/` y lo prueba `int/sembrar-demostracion.e2e-spec.ts` (crea, no duplica,
  `--salida` rechazado en producción, ninguna clave en el logger capturador).
- [ ] T018 [P] [US3] `tests/e2e/apoyo/`:
  - `sistema.ts`: siembra con `docker compose exec`, lectura de `dev:otp:<id>` con `redis-cli` y
    ayudantes de ingreso del personal con OTP;
  - archivos ficticios (PDF y JPG).
- [ ] T019 [US3] `tests/e2e/ruta-a.spec.ts`:
  1. el asistente lleva a LIC-02;
  2. identidad con OTP (el `desafioId` se toma de la respuesta interceptada);
  3. solicitud con documentos y comprobante;
  4. el evaluador inicia y confirma el riesgo;
  5. caja registra el pago;
  6. el evaluador aprueba;
  7. la consulta muestra "Descargar licencia" (descarga el PDF);
  8. `/verificar/<código>` muestra la licencia vigente con el titular abreviado.
- [ ] T020 [US3] `tests/e2e/ruta-b.spec.ts`:
  1. solicitud LIC-03;
  2. evaluación;
  3. pago;
  4. la jefatura asigna;
  5. el inspector registra un resultado favorable con 2 fotos;
  6. la consulta muestra la licencia emitida.
- [ ] T021 [US3] `wf/e2e.yml`:
  - se dispara en `pull_request` y `push` a `main`;
  - levanta `infra/docker-compose.yml`;
  - instala Chromium con dependencias;
  - ejecuta `npm run e2e`;
  - sube artefactos si falla;
  - baja con `-v`.

  No toca `ci.yml`. Ejecutar T019 y T020 en local contra un clon aislado del compose (proyecto
  propio, puertos propios) y bajarlo con `-v`.

**Punto de control**: el sistema completo probado en el navegador (criterio 6).

---

## Fase 6: Historia de usuario 4 - Producción con HTTPS y dos réplicas (Prioridad: P2)

**Objetivo**: compose de producción completo, probado en local con `DOMINIO=localhost`.

**Prueba independiente**: `prod/verificar-local.sh` termina con todo "OK".

- [ ] T022 [US4] Etapa `produccion` en `apps/web/Dockerfile`: Caddy con `dist` y el Caddyfile. La
  etapa final por defecto sigue siendo nginx. Además, `prod/Caddyfile` (research §R-05,
  [contracts/produccion.md](./contracts/produccion.md)) con:
  - `{$DOMINIO}`;
  - compresión;
  - caché por ruta;
  - cabeceras de seguridad iguales a las de `apps/web/cabeceras-seguridad.conf` más HSTS;
  - balanceo con salud a `api-a` y `api-b`;
  - límite de cuerpo.
- [ ] T023 [US4] `prod/docker-compose.yml` con:
  - `caddy`, `api-a`, `api-b`, `migrar` (perfil), `pgbouncer`, `postgres` y `redis`;
  - límites de memoria, salud y `restart`;
  - solo Caddy publica puertos;
  - las APIs sin migración al arrancar y con `DATABASE_URL` hacia PgBouncer.

  Además, `prod/.env.ejemplo` (solo nombres).
- [ ] T024 [US4] `prod/verificar-local.sh` (prueba de la configuración):
  - levanta el proyecto aislado `prod007` en puertos libres;
  - comprueba que solo Caddy publica puertos;
  - comprueba cabeceras, compresión, redirección y que TLS 1.2 se rechaza (solo 1.3);
  - comprueba que la suma de los límites de memoria de los contenedores es ≤ 1.6 GB (FR-027);
  - detiene `api-a` y verifica que 20 de 20 peticiones responden 200;
  - baja el proyecto con `-v`.

  Ejecutarlo y guardar la salida en `dep/resultados.md`.
- [ ] T025 [P] [US4] `prod/verificar-puertos.sh <ip>` (desde fuera) y
  `dep/guia-vps.md`:
  - droplet;
  - llave SSH en PowerShell;
  - ufw 22/80/443 y cortafuegos de DigitalOcean;
  - Docker;
  - usuario `despliegue`;
  - `.env` con secretos generados en el servidor;
  - secretos en GitHub;
  - primer despliegue;
  - cómo vigilar la memoria.
- [ ] T026 [P] [US4] `dep/dominio-cloudflare.md` (DNS con proxy, CDN solo `/assets/`, Full strict,
  origen solo con rangos de Cloudflare, `TRUST_PROXY_SALTOS=2` y `trusted_proxies`) y actualización
  de ADR-010 en `docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md` con lo implementado y
  lo pendiente sin dominio.
- [ ] T027 [US4] **[servidor]** Primer despliegue en el droplet según `dep/guia-vps.md`:
  - HTTPS válido en `<ip>.sslip.io`;
  - `verificar-puertos.sh` con salida documentada (SC-006);
  - caída de una réplica (SC-009).

**Punto de control**: producción lista para levantarse con un comando.

---

## Fase 7: Historia de usuario 5 - Respaldo, restauración y PgBouncer (Prioridad: P2)

**Objetivo**: respaldo diario con restauración probada y conexiones acotadas.

**Prueba independiente**: con `verificar-local.sh`, el respaldo y la restauración coinciden en los
conteos y PgBouncer no pasa de 20 conexiones.

- [ ] T028 [US5] `prod/respaldo.sh` (research §R-09):
  - `pg_dump -Fc` y `tar` de los documentos;
  - escribe en `.parcial` y renombra al terminar;
  - borra las copias de más de 7 días solo después del éxito;
  - permisos 700/600.

  `prod/restaurar.sh` restaura en `licencias_restaurada`, compara la tabla de conteos y acepta
  `--reemplazar` con confirmación.
- [ ] T029 [US5] Ampliar `prod/verificar-local.sh`:
  - siembra datos ficticios (con el comando de T017);
  - genera carga en las 2 réplicas y comprueba que las conexiones de PgBouncer en
    `pg_stat_activity` son ≤ 20;
  - ejecuta `respaldo.sh` y `restaurar.sh` (todo `ok`);
  - comprueba que una copia fallida no borra la anterior.
- [ ] T030 [P] [US5] `dep/respaldo-restauracion.md` (cron, bajar copias con `scp` desde PowerShell
  cada semana, restaurar paso a paso) y actualización de ADR-008 (PgBouncer y respaldos hechos;
  Patroni como siguiente paso, con el motivo).

**Punto de control**: datos protegidos (criterio 9).

---

## Fase 8: Historia de usuario 6 - Despliegue continuo con vuelta atrás (Prioridad: P3)

**Objetivo**: `cd.yml` y `desplegar.sh` probados en local.

**Prueba independiente**: en el proyecto local de producción, `desplegar.sh` con una versión buena
sale con 0 y con una que no arranca sale con 1 y queda en la anterior.

- [ ] T031 [US6] `prod/desplegar.sh <version>` (research §R-06,
  [contracts/produccion.md](./contracts/produccion.md)):
  - guarda la versión anterior;
  - hace `pull` y `migrar`;
  - actualiza `api-a` y luego `api-b` esperando `healthy`;
  - actualiza Caddy;
  - hace la prueba de humo;
  - vuelve atrás si falla;
  - devuelve los códigos 0, 1, 2 y 3.
- [ ] T032 [US6] Ampliar `prod/verificar-local.sh`:
  - construye dos etiquetas locales, una buena y una "rota" (API que sale al arrancar);
  - ejecuta `desplegar.sh` con cada una;
  - durante el despliegue bueno, un sondeo de `/api/v1/salud` cada 200 ms no ve ningún error.
- [ ] T033 [US6] `wf/cd.yml` (research §R-10):
  - `workflow_run` de CI en `main` con `success`;
  - construcción y publicación en GHCR (`sha-<7>`);
  - SSH con `known_hosts` fijo;
  - copia de `prod/`;
  - login de GHCR con el token del job;
  - `desplegar.sh`;
  - `concurrency: produccion` y `environment: produccion`.

  Validar la sintaxis con `actionlint` (contenedor `rhysd/actionlint:1.7.4`) y gitleaks sin
  hallazgos.
- [ ] T033b [US6] `prod/revisar-migraciones.sh`: avisa con código 1 si una migración nueva respecto de
  `main` contiene `DROP TABLE`, `DROP COLUMN`, `RENAME` o `ALTER COLUMN … TYPE` sin el comentario
  `-- compatible: <motivo>`. Además, la regla "agregar antes de quitar" se escribe en `dep/guia-vps.md`
  y en `.github/pull_request_template.md`. Probarlo con una migración de ejemplo temporal (FR-035).
- [ ] T034 [US6] **[servidor]** Primer despliegue automático después de una fusión en `main` (SC-012)
  y prueba de vuelta atrás.

**Punto de control**: despliegue continuo preparado (criterio 12).

---

## Fase 9: Historia de usuario 7 - Medición en producción y datos de demostración (Prioridad: P3)

**Objetivo**: flujos de medición preparados, plantilla SUS y datos de demostración.

- [ ] T035 [P] [US7] `tests/carga/eq02-picos.js` (`stages` 100 → 500 → 1,000, umbrales p95 y errores)
  y `wf/k6.yml`:
  - `workflow_dispatch` con `base_url`, `escenario` y `replicas`;
  - SSH para detener o levantar `api-b`, siempre;
  - artefacto del resumen.

  Validar con `actionlint` y probar los scripts de k6 en local contra el compose de desarrollo con
  pocos usuarios.
- [ ] T036 [P] [US7] `wf/calidad-produccion.yml` (ZAP baseline que falla con alertas altas o medias,
  Lighthouse móvil con accesibilidad ≥ 0.9 en 4 pantallas, testssl de protocolos y cabeceras).
  Validar con `actionlint`.
- [ ] T037 [P] [US7] `dep/sus.md`: las 10 preguntas del SUS en español, instrucciones para 5
  personas, cómo calcular el puntaje y una tabla para anotar los resultados. También
  `dep/resultados.md`, con la plantilla de k6, ZAP, Lighthouse, testssl y puertos más los resultados
  locales.
- [ ] T038 [US7] **[servidor]** Ejecutar `k6.yml` (`eq01-100`, `eq01-1000` y `eq02-picos` con 1 y 2
  réplicas) y `calidad-produccion.yml`, sembrar los datos de demostración y anotar los resultados
  (SC-007, SC-008, SC-010 y SC-011).

---

## Fase 10: Acabado y temas transversales

- [ ] T039 [P] Prueba de integración `int/matriz-permisos-007.e2e-spec.ts`: tablero y reporte (JSON y
  CSV) con 401 sin sesión y 403 para los 5 roles que no son JEFATURA (SC-003).
- [ ] T040 [P] Prueba de integración `int/privacidad-007.e2e-spec.ts` con el logger capturador. Ni el
  tablero, ni el reporte, ni el CSV, ni las claves de caché `rep:*`, ni los registros, ni las URL
  contienen documento, RUC, celular, correo, dirección ni nombre completo del titular (SC-004).
- [ ] T041 Medir SC-001: tablero con 10,000 expedientes sembrados en un clon aislado, ≤ 3 s a 360 px,
  sin desplazamiento horizontal. Bajar el clon con `-v`.
- [ ] T042 Documentación:
  - `README.md`: funcionalidad 007, cómo desplegar, la dirección pública como pendiente
    **[servidor]**, los resultados y el estado de los 16 criterios del proyecto;
  - `dep/README.md`;
  - `docs/03-diseno-de-software/diagrama-casos-de-uso.md`: CU20 y CU22 a "✅ Hecho".
- [ ] T043 Cadena completa de CI en local:
  - `build`, `lint`, `formato`, `typecheck`;
  - `test:unit` y `test:integracion` (con PostgreSQL temporal en 5433 y Redis en 16379);
  - pruebas del portal;
  - `cobertura` ≥ 80 %;
  - `regla-dependencia`, `contrato`;
  - `actionlint` de todos los flujos;
  - `infra/produccion/revisar-migraciones.sh` (FR-035);
  - gitleaks sin hallazgos (historial y árbol).

  Sin push ni PR (los hace la usuaria).

---

## Dependencias y orden de ejecución

- **Fase 1 → Fase 2 → historias**. Las historias 1 y 2 necesitan la fase 2 (contrato y fachadas).
- **Historia 3**: necesita T017 (siembra). Se puede hacer en paralelo con las historias 1 y 2, porque
  los recorridos no usan el tablero.
- **Historias 4 → 5 → 6**: comparten `prod/docker-compose.yml` y `verificar-local.sh`, así que van en
  orden. La historia 5 usa T017 para los datos.
- **Historia 7**: necesita la historia 4 (dirección pública) para ejecutar. Su preparación (T035 a
  T037) va en paralelo.
- **Tareas [servidor]** (T027, T034 y T038): quedan para cuando exista el droplet.
- **Fase 10**: al final.

## Ejemplos en paralelo

- Historia 1: T007, T008 y T009 juntas; luego T010 → T011, y T012 en paralelo con T011.
- Historia 4: T025 y T026 en paralelo con T022 a T024.
- Historia 7: T035, T036 y T037 juntas.

## Estrategia

1. **MVP**: fases 1 a 3 (tablero).
2. Luego, el reporte (fase 4) y E2E (fase 5).
3. Después, la producción local probada (fases 6 a 8) y la preparación de las mediciones (fase 9).
4. Por último, el acabado (fase 10).
5. Las tareas [servidor] se ejecutan con la usuaria cuando cree el droplet.
6. Commit al terminar cada fase.
