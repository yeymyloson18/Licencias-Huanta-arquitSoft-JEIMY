# Tareas: Evaluación del expediente, esquela de pago y pago en caja

**Entrada**: documentos de diseño en `specs/005-evaluacion-pago/`
**Requisitos previos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: obligatorias (constitución, principio V). En cada historia, las pruebas se escriben antes
que la implementación y deben fallar primero.

**Abreviaturas de rutas**: `tra/` = `apps/api/src/modulos/tramites/`, `pag/` =
`apps/api/src/modulos/pagos/`, `seg/` = `apps/api/src/modulos/seguridad/`, `cat/` =
`apps/api/src/modulos/catalogo/`, `com/` = `apps/api/src/compartido/`, `test-tra/` =
`apps/api/test/unit/modulos/tramites/`, `test-pag/` = `apps/api/test/unit/modulos/pagos/`, `int/` =
`apps/api/test/integracion/`, `web/` = `apps/web/src/`.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[US1]…[US6]**: historia de usuario de [spec.md](./spec.md)

---

## Fase 1: Preparación

- [X] T001 Agregar `pdf-lib` como dependencia de ejecución de `apps/api` (research §R-07) y comprobar
  que `npm ci` y `npm run build` siguen en verde
- [X] T002 [P] Crear `pag/pagos.module.ts` (vacío), `pag/fachada.ts` (`export {}`) y registrar
  `PagosModule` en `apps/api/src/app.module.ts`; quitar los `.gitkeep` de `pag/`

---

## Fase 2: Base (bloquea todas las historias)

- [X] T003 Actualizar `docs/06-contrato-api/openapi.yaml` y su README según
  [contracts/openapi-cambios.md](./contracts/openapi-cambios.md): nueva `POST
  /expedientes/{numeroExpediente}/evaluacion`, `codigoReceta` en riesgo, aprobar para PAGADO de ruta A
  o C, `plazoSubsanarEn` opcional, `identidad` en subsanar y respuesta EN_EVALUACION, `estadoExpediente`
  y `nombreLicencia` en `Esquela`, 202/403 en el PDF, 422/409 con `type` en pago y recibo, y los
  permisos. En `descargarDocumento`, la descripción pasa a decir que `tokenConsulta` se habilita en la
  009 (la 005 no lo pide). Regenerar `packages/contracts` y pasar `npm run contrato`
- [X] T004 Migración `apps/api/prisma/migrations/0008_evaluacion_pago/migration.sql` (acciones
  `INICIAR_EVALUACION` y `SUBSANAR` en `tramites.auditoria`; `plazo_subsanar_en` opcional;
  `reintentar_en` e índice en `comun.evento_pendiente`) con el nombre
  real de la restricción; actualizar `docs/05-modelo-de-datos/esquema.sql`,
  `modelo-entidad-relacion.md` y `schema.prisma`; la prueba `int/esquema-equivalente` debe seguir en
  verde
- [X] T005 [P] Prueba unitaria `test-tra/dominio/maquina-estados.spec.ts` y dominio
  `tra/dominio/maquina-estados.ts` (tabla de research §R-03, `ErrorTransicionInvalida` con el estado
  actual; aprobar solo en rutas A y C; DENEGADO es final)
- [X] T006 [P] Prueba y dominio `tra/dominio/grupo-licencia.ts` (grupos establecimiento, cesionario,
  corporativa y bodega; `mismoGrupo`) y `cat/fachada.ts` `obtenerRecetaParaEvaluacion(codigo)`
  (código, nombre, ruta, tasa, nivel y grupo; `null` si no es LICENCIA o no está activa), con su prueba
  en `apps/api/test/unit/modulos/catalogo/`
- [X] T007 Despachador de eventos `com/infraestructura/despachador-eventos.ts` (research §R-02:
  registro de manejadores por tipo, cada 2 s con `unref()`, `pg_try_advisory_xact_lock`,
  `FOR UPDATE SKIP LOCKED`, reintentos sin límite con espera creciente en `reintentar_en` (máximo 5
  min) y un aviso en el registro cada 10 fallos, `ultimo_error` solo con el nombre del error, tipos sin
  manejador intactos) con prueba de integración `int/despachador-eventos.e2e-spec.ts`: procesa,
  reintenta tras un error respetando la espera, no toca tipos sin manejador, una sola réplica con el
  candado
- [X] T008 [P] Errores comunes en `com/presentacion/error-problema.ts`: `transicionInvalida(estado)`,
  `yaObservado`, `esquelaYaPagada`, `reciboRepetido`, `versionCambiada` (412) y sus títulos en
  `filtro-problema.ts`
- [X] T009 [P] Apoyo de pruebas `apps/api/test/apoyo/evaluacion-prueba.ts`: llevar un expediente
  sembrado a un estado dado (EN_EVALUACION, PENDIENTE_PAGO, PAGADO, OBSERVADO) por la base y procesar
  los eventos pendientes una vez (`procesarEventos(app)`)

**Punto de control**: contrato, migración, máquina de estados, grupos y despachador listos.

---

## Fase 3: Historia de usuario 1 - Evaluar el expediente y confirmar el riesgo (P1) 🎯 MVP

**Objetivo**: el evaluador empieza la revisión, confirma o corrige el riesgo (con esquela única),
observa una vez o deniega.

**Prueba independiente**: un expediente REGISTRADO pasa a EN_EVALUACION, luego a PENDIENTE_PAGO y en
segundos tiene una sola esquela con el monto de la licencia.

### Pruebas de la historia 1 ⚠️

- [X] T010 [P] [US1] Pruebas unitarias en `test-tra/aplicacion/decisiones-evaluador.spec.ts` (con
  dobles): iniciar, confirmar (misma licencia, corregida del grupo, otro grupo → error, licencia no
  vigente → error, tasa 0 → PAGADO sin evento de esquela), observar (texto corto → error, segunda vez →
  error), denegar; cada una con historial, auditoría y `EstadoExpedienteCambiado`; versión distinta →
  `ErrorVersionCambiada`
- [X] T011 [P] [US1] Pruebas unitarias en `test-pag/aplicacion/generar-esquela.spec.ts` y
  `test-pag/dominio/esquela.spec.ts`: código `ESQ-<número>`, monto > 0, generar dos veces no duplica,
  `registrarPago` una sola vez, `corregirRecibo` solo si está pagada y con motivo
- [X] T012 [P] [US1] Prueba de integración `int/evaluacion-expediente.e2e-spec.ts`: iniciar → 200
  EN_EVALUACION con `If-Match`; confirmar → 200 PENDIENTE_PAGO y, tras procesar eventos, una esquela con
  la tasa; confirmar de nuevo → 409 y una sola esquela; 10 confirmaciones en paralelo → una esquela;
  corregir a LIC-03 → ruta B y tasa 305.90; a otro grupo → 422; LIC-09 → PAGADO sin esquela; observar →
  OBSERVADO y segunda vez 409; denegar → DENEGADO y luego cualquier acción 409; versión vieja → 412;
  respuestas contra el contrato

### Implementación de la historia 1

- [X] T013 [US1] Puertos y casos de uso `tra/aplicacion/iniciar-evaluacion.ts`, `confirmar-riesgo.ts`,
  `observar-expediente.ts` y `denegar-expediente.ts` con el puerto
  `tra/dominio/puertos/repositorio-decisiones.ts` (aplicar una decisión con `UPDATE` condicional por
  estado y versión, historial, auditoría y eventos en una transacción). Deben pasar T010
- [X] T014 [US1] Adaptadores `tra/infraestructura/repositorio-decisiones-postgres.ts` y
  `catalogo-evaluacion-fachada.ts`
- [X] T015 [US1] Dominio y caso de uso `pag/dominio/esquela.ts`, `pag/aplicacion/generar-esquela.ts`,
  repositorio `pag/infraestructura/repositorio-esquelas-postgres.ts` (`INSERT … ON CONFLICT DO
  NOTHING`) y manejador de `EsquelaSolicitada` registrado en el despachador desde `pagos.module.ts`.
  Deben pasar T011
- [X] T016 [US1] Controlador `tra/presentacion/evaluacion.controller.ts` (`POST evaluacion`, `riesgo`,
  `observar`, `denegar` con `@RequiereRoles('EVALUADOR')`, `If-Match` obligatorio, zod, 409/412/422) y
  el detalle del expediente con `nivelRiesgoPropuesto`, `nivelRiesgoConfirmado` y `observaciones`.
  Deben pasar T012
- [X] T017 [P] [US1] `web/servicios/clienteApi.ts`: `iniciarEvaluacion`, `confirmarRiesgo`,
  `observarExpediente`, `denegarExpediente` (con `If-Match`) y `listarLicenciasDelGrupo` (desde el
  catálogo público)
- [X] T018 [US1] Prueba `web/componentes/AccionesEvaluador.test.tsx` y componente
  `web/componentes/AccionesEvaluador.tsx` en `web/paginas/personal/DetalleExpediente.tsx`: botones según
  rol y estado ([contracts/portal-evaluacion-pago.md](./contracts/portal-evaluacion-pago.md)), diálogo
  de riesgo con las licencias del grupo, textos con contador, 409/412 recargan el detalle con aviso

**Punto de control**: la historia 1 funciona sola.

---

## Fase 4: Historia de usuario 2 - Registrar el pago en caja (P1)

**Objetivo**: caja ve los datos de la esquela, registra el recibo una sola vez y el expediente pasa a
PAGADO solo.

**Prueba independiente**: con una esquela pendiente, registrar el pago y ver PAGADO en segundos.

### Pruebas de la historia 2 ⚠️

- [X] T019 [P] [US2] Pruebas unitarias `test-pag/aplicacion/registrar-pago-en-caja.spec.ts` y
  `test-pag/dominio/numero-recibo.spec.ts`: recibo normalizado (mayúsculas, sin espacios, 4 a 30);
  expediente que no está PENDIENTE_PAGO → error; ya pagada → error; recibo repetido → error; éxito con
  auditoría y `PagoRegistrado`
- [X] T020 [P] [US2] Prueba unitaria `test-tra/aplicacion/aplicar-pago-registrado.spec.ts`:
  PENDIENTE_PAGO → PAGADO con historial del sistema y el evento `EstadoExpedienteCambiado`; ya PAGADO →
  no cambia nada (ni repite el evento)
- [X] T021 [P] [US2] Prueba de integración `int/pago-en-caja.e2e-spec.ts`: CAJA consulta la esquela y
  el titular; registra → 201 con auditoría y evento; tras procesar eventos, PAGADO; segundo pago → 409
  `esquela-ya-pagada`; 10 pagos en paralelo → un 201; recibo repetido → 409 `recibo-repetido`; recibo
  inválido → 422; expediente DENEGADO (esquela sembrada) → 409; código inexistente → 404; el manejador
  falla una vez y en la siguiente pasada deja el expediente PAGADO

### Implementación de la historia 2

- [X] T022 [US2] `pag/dominio/numero-recibo.ts`, casos de uso `pag/aplicacion/consultar-esquela.ts` y
  `registrar-pago-en-caja.ts` (transacción con `UPDATE` condicional, auditoría y `PagoRegistrado`),
  puerto `pag/dominio/puertos/estado-expediente.ts` con adaptador `pag/infraestructura/tramites-fachada.ts`.
  Deben pasar T019
- [X] T023 [US2] `tra/fachada.ts`: `estadoParaPago(numero)` y `nombreTitular(numero)`; caso de uso
  `tra/aplicacion/aplicar-pago-registrado.ts` y su manejador de `PagoRegistrado` registrado desde
  `tramites.module.ts`. Deben pasar T020
- [X] T024 [US2] Controladores `pag/presentacion/esquelas.controller.ts` (`GET /esquelas/{codigo}` y
  `POST /esquelas/{codigo}/pago`, rol CAJA) y `GET /expedientes/{n}/titular` en `tramites` (rol CAJA,
  `no-store`). Deben pasar T021
- [X] T025 [US2] `web/servicios/clienteApi.ts` (`consultarEsquela`, `obtenerTitularParaCaja`,
  `registrarPago`) y prueba + página `web/paginas/personal/Caja.tsx` (buscar, ver, confirmar, registrar;
  mensajes 404/409/422); ruta `/personal/caja` con `RutaProtegida roles={['CAJA']}` y opción "Caja" en
  `web/componentes/Menu.tsx` (actualizar `Menu.test.tsx`)

**Punto de control**: las historias 1 y 2 completan el ciclo evaluación → pago.

---

## Fase 5: Historia de usuario 3 - Obtener la esquela de pago (P2)

**Objetivo**: el administrado y el personal descargan el PDF de la esquela.

**Prueba independiente**: consultar un expediente PENDIENTE_PAGO, recibir el `tokenConsulta` y
descargar el PDF sin datos personales.

### Pruebas de la historia 3 ⚠️

- [X] T026 [P] [US3] Pruebas unitarias `test-pag/aplicacion/descargar-pdf-esquela.spec.ts` (contenido:
  número, concepto, monto, código, fecha e instrucciones; esquela inexistente → aún no generada) y de
  `seg` para el `tokenConsulta` (audiencia propia, 15 minutos, no sirve como token del personal ni de
  identidad)
- [X] T027 [P] [US3] Prueba de integración `int/esquela-pdf.e2e-spec.ts`: la consulta de un expediente
  PENDIENTE_PAGO trae `codigoEsquela`, `montoEsquela`, `esquelaPagada` y `tokenConsulta`; con el token,
  el PDF → 200 `application/pdf` con `%PDF`, `attachment` y `no-store`, y el texto del PDF sin documento
  ni dirección del titular; token de otro expediente → 403; sin token → 401; antes de procesar el evento
  → 202; EVALUADOR, CAJA y JEFATURA → 200; MESA_PARTES → 403; otro estado → la consulta no trae token

### Implementación de la historia 3

- [X] T028 [US3] `seg`: `firmarConsulta`/`verificarConsulta` en el emisor de tokens,
  `ConsultaOPersonalGuard` y `emitirTokenConsulta(numero)` en `seg/fachada.ts`. Deben pasar su parte de
  T026
- [X] T029 [US3] `pag/aplicacion/descargar-pdf-esquela.ts` con el puerto `pag/dominio/puertos/pdf-esquela.ts`
  y el adaptador `pag/infraestructura/pdf-esquela-pdflib.ts`; `GET /esquelas/{codigo}/pdf` en
  `esquelas.controller.ts`; `pag/fachada.ts` `esquelaDelExpediente(numero)`
- [X] T030 [US3] Consulta pública de `tramites`: cuando el expediente está PENDIENTE_PAGO, agrega los
  datos de la esquela (por la fachada de pagos) y el `tokenConsulta` (por la fachada de seguridad);
  cuando está OBSERVADO, `observacionesPendientes`. Deben pasar T027
- [X] T031 [US3] `web/paginas/Consulta.tsx` (+ prueba): monto, código y "Descargar esquela" con el token
  (202 → aviso de reintento); texto de la observación; botón "Descargar esquela" en el detalle del
  personal

**Punto de control**: el administrado obtiene su esquela.

---

## Fase 6: Historia de usuario 4 - Subsanar la observación (P2)

**Objetivo**: el titular o mesa de partes subsana y el expediente vuelve a evaluación.

**Prueba independiente**: un expediente OBSERVADO vuelve a EN_EVALUACION con el documento agregado.

### Pruebas de la historia 4 ⚠️

- [X] T032 [P] [US4] Pruebas unitarias `test-tra/aplicacion/subsanar-observacion.spec.ts`: en línea con
  la identidad del titular; con otra identidad → error sin datos; mesa de partes; sin documentos →
  error; requisito que no es de la receta → error; documento ajeno o vencido → error; no OBSERVADO →
  transición inválida
- [X] T033 [P] [US4] Prueba de integración `int/subsanacion.e2e-spec.ts`: titular confirma identidad,
  sube y subsana → 200 EN_EVALUACION con el documento agregado y `subsanada_en`; otra identidad → 403;
  MESA_PARTES → 200; EVALUADOR → 403; expediente REGISTRADO → 409

### Implementación de la historia 4

- [X] T034 [US4] `tra/aplicacion/subsanar-observacion.ts` (reutiliza la revisión de documentos de la
  004) y su escritura en `repositorio-decisiones-postgres.ts`. Deben pasar T032
- [X] T035 [US4] `tra/presentacion/subsanacion.controller.ts` (`POST …/subsanar` con `SolicitanteGuard`).
  Debe pasar T033
- [X] T036 [US4] Portal: en `web/paginas/Consulta.tsx`, cuando está OBSERVADO, enlace "Subsanar" que
  lleva a confirmar la identidad (004) y a un formulario de documentos de subsanación
  (`web/paginas/tramite/Subsanar.tsx` + prueba) que reutiliza la subida de la 004

---

## Fase 7: Historia de usuario 5 - Aprobar el expediente pagado (P3)

- [X] T037 [P] [US5] Pruebas: unitaria en `test-tra/aplicacion/decisiones-evaluador.spec.ts` (aprobar
  PAGADO de ruta A o C; ruta B o no PAGADO → error) e integración `int/aprobacion.e2e-spec.ts`
- [X] T038 [US5] `AprobarExpediente` en `tra/aplicacion/decisiones-evaluador.ts` (comparte la base de las decisiones) y `POST …/aprobar` en `evaluacion.controller.ts`;
  botón "Aprobar" en `AccionesEvaluador.tsx` (+ prueba)

---

## Fase 8: Historia de usuario 6 - Corregir un recibo y revisar la auditoría (P3)

### Pruebas de la historia 6 ⚠️

- [X] T039 [P] [US6] Pruebas unitarias `test-pag/aplicacion/corregir-numero-recibo.spec.ts` y
  `consultar-auditoria-pagos.spec.ts`; `test-tra/aplicacion/consultar-auditoria-expediente.spec.ts`
- [X] T040 [P] [US6] Prueba de integración `int/auditoria-pagos.e2e-spec.ts`: JEFATURA corrige con motivo
  → 200 y `CORREGIR_RECIBO` con anterior y nuevo; sin motivo → 422; no pagada → 409; recibo repetido →
  409; `GET /pagos/auditoria?desde&hasta` ordenada y paginada; `GET /expedientes/{n}/auditoria` con las
  decisiones y `nombreUsuario`; sin datos del titular

### Implementación de la historia 6

- [X] T041 [US6] `pag/aplicacion/corregir-numero-recibo.ts`, `consultar-auditoria-pagos.ts` y
  `pag/presentacion/auditoria-pagos.controller.ts` (`PATCH …/recibo`, `GET /pagos/auditoria`, rol
  JEFATURA); nombres del personal por la fachada de seguridad (`nombresDeUsuarios`)
- [X] T042 [US6] `tra/aplicacion/consultar-auditoria-expediente.ts` y
  `tra/presentacion/auditoria.controller.ts` (rol JEFATURA). Deben pasar T040
- [X] T043 [US6] Prueba y página `web/paginas/personal/Auditoria.tsx` (filtro de fechas, paginación,
  "Corregir recibo" con motivo); ruta con `RutaProtegida roles={['JEFATURA']}`, opción "Auditoría" en el
  menú y sección de auditoría en el detalle para jefatura

---

## Fase 9: Acabado y temas transversales

- [ ] T044 [P] Prueba de integración `int/flujo-evaluacion-pago.e2e-spec.ts`: REGISTRADO → EN_EVALUACION
  → riesgo → esquela → pago → PAGADO → APROBADO, con un historial de 5 cambios y sus eventos
- [ ] T045 [P] Prueba de integración `int/matriz-permisos-evaluacion-pago.e2e-spec.ts`: cada endpoint
  nuevo con sin sesión 401 y cada rol que no corresponde 403, sin cambiar datos (SC-007)
- [ ] T046 [P] Prueba de integración `int/privacidad-evaluacion-pago.e2e-spec.ts` con el logger
  capturador: registros, URL, errores, eventos, auditorías y el texto del PDF sin documento, RUC,
  celular, correo ni dirección del titular (SC-006)
- [ ] T049 Medir SC-001 (evaluador: desde la bandeja hasta confirmar el riesgo, ≤ 2 min) y SC-002
  (caja: desde el código de la esquela hasta registrar el pago, ≤ 1 min) con un recorrido automatizado
  en el navegador a 360 px, en un clon aislado con usuarios y datos ficticios (como en la 004); bajar el
  clon con `-v` al terminar. No incluye k6, Lighthouse ni ZAP (quedan para el despliegue, 007)
- [ ] T047 Actualizar `README.md` (sección de la funcionalidad 005, con los tiempos de T049) y
  `docs/03-diseno-de-software/diagrama-casos-de-uso.md` (CU13, CU14, CU16 y CU21 a "✅ Hecho")
- [ ] T048 Cadena completa de CI en local (`build`, `lint`, `formato`, `test:unit`,
  `test:integracion` con PostgreSQL temporal en 5433 y Redis en 16379, `cobertura` ≥ 80 % por archivo en
  `dominio` y `aplicacion` de `tramites` y `pagos`, `regla-dependencia`, `contrato`) y gitleaks sin
  hallazgos. Sin push ni PR (los hace la usuaria)

---

## Dependencias y orden de ejecución

- Fase 1 → Fase 2 → historias. Las historias dependen de la fase 2.
- US2 necesita las esquelas de US1 (T015). US3 necesita la esquela (T015) y la consulta de la 004.
  US4 necesita la observación de US1. US5 necesita PAGADO (US2). US6 necesita pagos (US2).
- Orden recomendado: US1 → US2 → US3 → US4 → US5 → US6 → fase 9.

## Oportunidades de paralelismo

- Fase 2: T005, T006, T008 y T009 en paralelo; T007 después de T004.
- En cada historia, las pruebas [P] en paralelo; el portal [P] en paralelo con la API.

## Estrategia

- **MVP**: fases 1 a 4 (evaluación + esquela + pago en caja).
- Luego US3 (PDF), US4 (subsanación), US5 (aprobación), US6 (auditoría) y el acabado.
- Un commit por fase; sin push.
