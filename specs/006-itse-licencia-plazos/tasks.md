# Tareas: Inspección ITSE, licencia con QR, plazos en días hábiles y avisos

**Entrada**: documentos de diseño en `specs/006-itse-licencia-plazos/`
**Requisitos previos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: obligatorias (constitución, principio V). En cada historia, las pruebas se escriben antes
que la implementación y deben fallar primero.

**Abreviaturas de rutas**: `tra/` = `apps/api/src/modulos/tramites/`, `ins/` =
`apps/api/src/modulos/inspecciones/`, `lic/` = `apps/api/src/modulos/licencias/`, `pla/` =
`apps/api/src/modulos/plazos/`, `not/` = `apps/api/src/modulos/notificaciones/`, `seg/` =
`apps/api/src/modulos/seguridad/`, `com/` = `apps/api/src/compartido/`, `test-X/` =
`apps/api/test/unit/modulos/X/`, `int/` = `apps/api/test/integracion/`, `web/` = `apps/web/src/`.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[US1]…[US5]**: historia de usuario de [spec.md](./spec.md)

---

## Fase 1: Preparación

- [X] T001 Agregar `qrcode-generator` como dependencia de ejecución de `apps/api` (research §R-09) y
  comprobar que `npm ci` y `npm run build` siguen en verde
- [X] T002 [P] Crear `pla/plazos.module.ts`, `ins/inspecciones.module.ts`, `lic/licencias.module.ts` y
  `not/notificaciones.module.ts` (vacíos), sus `fachada.ts` (`export {}`), registrarlos en
  `apps/api/src/app.module.ts` y quitar los `.gitkeep`
- [X] T003 [P] Mover `tra/dominio/tipo-archivo.ts` a `com/dominio/tipo-archivo.ts` y
  `tra/infraestructura/almacen-archivos-disco.ts` (con su puerto `AlmacenArchivos`) a `com/`
  (research §R-13); ajustar importaciones y pruebas de la 004 sin cambiar su comportamiento

---

## Fase 2: Base (bloquea todas las historias)

- [X] T004 Actualizar `docs/06-contrato-api/openapi.yaml` y su README según
  [contracts/openapi-cambios.md](./contracts/openapi-cambios.md) (roles, fotos 1 a 5, certificado,
  `GET /inspecciones/inspectores`, `POST /plazos/alertas/{alertaId}/atender`, `id` y `atendidaPor` en
  `AlertaPlazo`, `numeroLicencia` en `Expediente`, `itseEstado` en `LicenciaPublica`, 403/422/503 y
  `plazoSubsanarEn` ignorado); regenerar `packages/contracts` y pasar `npm run contrato`
- [X] T005 Migración `apps/api/prisma/migrations/0010_itse_licencia_plazos/migration.sql` según
  [data-model.md](./data-model.md) (`plazo_restante_dias` con `CHECK (… >= 0)`, `numero_certificado`
  varchar(30) y `certificado_emitido_en` date con su CHECK conjunto, `atendida_por` uuid, `evento_id`
  bigint UNIQUE y `reintentar_en` timestamptz en `mensaje`, 16 feriados de 2026 con
  `ON CONFLICT DO NOTHING`, y marcar como procesados los `EstadoExpedienteCambiado` pendientes de la 005 para no enviar avisos atrasados); actualizar `schema.prisma`, `docs/05-modelo-de-datos/esquema.sql`,
  `datos-semilla.sql` si corresponde y `modelo-entidad-relacion.md`; pasar la prueba
  `esquema-equivalente`
- [X] T006 [P] `com/infraestructura/despachador-eventos.ts`: el manejador recibe `(datos, { id })`
  (research §R-02); prueba en `int/despachador-eventos.e2e-spec.ts`
- [X] T007 [P] `tra/dominio/maquina-estados.ts`: transiciones nuevas de [data-model.md](./data-model.md)
  §1 (INICIAR_INSPECCION_PREVIA, EMITIR_LICENCIA, EMITIR_LICENCIA_PROVISIONAL, ESPERAR_ITSE_POSTERIOR,
  FINALIZAR, DENEGAR_POR_ITSE, DERIVAR_A_FISCALIZACION) con sus pruebas en
  `test-tra/dominio/maquina-estados.spec.ts`
- [X] T008 [P] Ayudantes de prueba: `apps/api/test/apoyo/itse-prueba.ts` (`limpiar006`, `sembrarLicencia`,
  `sembrarInspeccion`) y limpieza de los eventos nuevos en `limpiarTramites`

**Punto de control**: contrato, migración y piezas compartidas listas.

---

## Fase 3: Historia de usuario 1 - Emitir la licencia con QR y verificarla (P1) 🎯 MVP

**Objetivo**: aprobar emite la licencia (A definitiva, C provisional); el administrado la descarga y
cualquiera la verifica.

**Prueba independiente**: aprobar un expediente pagado de ruta A, ver la licencia, descargar el PDF y
verificarla sin sesión.

### Pruebas de la historia 1 ⚠️

- [X] T009 [P] [US1] Pruebas unitarias en `test-lic/dominio/` (número `LF-AAAA-NNNNNN`, código de 22
  caracteres base64url, titular público "Juana P. Q." y razón social, vigencia provisional de 12 meses,
  estado VENCIDA al leer) y `test-lic/aplicacion/emitir-licencia.spec.ts` (una vigente por expediente,
  reenvía `LicenciaEmitida` si ya existe, certificado con vencimiento a 2 años)
- [X] T010 [P] [US1] Pruebas unitarias `test-tra/aplicacion/aplicar-licencia-emitida.spec.ts` (A →
  LICENCIA_EMITIDA → ITSE_POSTERIOR_PENDIENTE + `InspeccionRequerida POSTERIOR`; B → LICENCIA_EMITIDA →
  FINALIZADO; C → LICENCIA_PROVISIONAL + `InspeccionRequerida BODEGA`; repetido no hace nada) y de
  aprobar publicando `LicenciaSolicitada`
- [X] T011 [P] [US1] Prueba de integración `int/licencia-emision.e2e-spec.ts`: aprobar A y C → tras
  procesar la cola, licencia, estados, historial y eventos; evento repetido no duplica; auditoría
  `EMITIR`/`EMITIR_PROVISIONAL` con usuario NULL
- [X] T012 [P] [US1] Prueba de integración `int/licencia-verificacion.e2e-spec.ts`: verificación
  pública con datos mínimos y sin datos personales; 404 igual para inexistente y mal formado; 10 fallos
  → 429 con `Retry-After`; consulta pública con `numeroLicencia` y `tokenConsulta`; PDF con `%PDF`, el
  código en el texto, sin documento ni dirección; token de otro expediente → 403; MESA_PARTES, EVALUADOR y JEFATURA
  → 200; CAJA → 403

### Implementación de la historia 1

- [X] T013 [US1] `lic/dominio/` (`licencia.ts`, `titular-publico.ts`, `codigo-verificacion.ts`,
  puertos) y `lic/aplicacion/emitir-licencia.ts`, `obtener-licencia.ts`, `verificar-licencia.ts`.
  Deben pasar T009
- [X] T014 [US1] `tra/fachada.ts` `datosParaLicencia(numero)` (giro, zona, nombre comercial, razón
  social, nombre del titular, ruta, vigencia en meses; sin documento); `AprobarExpediente` publica
  `LicenciaSolicitada`; `tra/aplicacion/aplicar-licencia-emitida.ts` y su manejador. Deben pasar T010
- [X] T015 [US1] `lic/infraestructura/` (repositorio Postgres con la transacción de emisión y el
  evento, `qr.ts` con `qrcode-generator`, `pdf-licencia-pdflib.ts`, limitador Redis
  `lim:verificacion:*`, manejador de `LicenciaSolicitada`), `lic/presentacion/licencias.controller.ts`
  (`GET /licencias/verificar/{codigo}`, `GET /licencias/{numero}`, `GET /licencias/{numero}/pdf` con
  `ConsultaOPersonalGuard`), `lic/fachada.ts` `licenciaDelExpediente(numero)`, variable
  `URL_PUBLICA_PORTAL`. Deben pasar T011 y T012
- [X] T016 [US1] Consulta pública y detalle: `tokenConsulta` también en los estados con licencia
  (research §R-18), `numeroLicencia` en `EstadoPublico` y en `Expediente`
- [X] T017 [US1] Portal: `web/paginas/Verificar.tsx` (ruta pública `/verificar/:codigo`, 404 y 429),
  `web/componentes/DescargarLicencia.tsx` en `Consulta.tsx` y `DetalleExpediente.tsx`, funciones del
  cliente y pruebas

**Punto de control**: rutas A y C llegan a la licencia; la verificación pública funciona.

---

## Fase 4: Historia de usuario 2 - Asignar inspectores y registrar el resultado ITSE (P1)

**Objetivo**: inspecciones creadas por el recorrido, asignadas por la jefatura y registradas por el
inspector con fotos.

**Prueba independiente**: ruta B pagada → EN_INSPECCION; asignar; registrar FAVORABLE con 2 fotos →
licencia y FINALIZADO.

### Pruebas de la historia 2 ⚠️

- [X] T018 [P] [US2] Pruebas unitarias `test-ins/dominio/inspeccion.spec.ts` (solo el asignado, una vez,
  observaciones obligatorias si es DESFAVORABLE, certificado obligatorio y normalizado si es FAVORABLE,
  fecha no futura, 1 a 5 fotos) y `test-ins/aplicacion/` (asignar con inspector activo y fecha no
  pasada, reasignar sin resultado, registrar con fotos guardadas y borradas si falla)
- [X] T019 [P] [US2] Pruebas unitarias `test-tra/aplicacion/aplicar-resultado-itse.spec.ts` (PREVIA
  favorable → `LicenciaSolicitada` con certificado; desfavorable → DENEGADO con las observaciones;
  POSTERIOR → FINALIZADO + `CertificadoItseRegistrado` o DERIVADO_A_FISCALIZACION; BODEGA favorable sin
  cambio de estado y desfavorable → DERIVADO) y del pago de ruta B → EN_INSPECCION +
  `InspeccionRequerida PREVIA`
- [X] T020 [P] [US2] Prueba de integración `int/inspecciones.e2e-spec.ts`: `InspeccionRequerida` crea
  una sola inspección; jefatura lista y asigna (inspector no válido o fecha pasada → 422); inspector
  ve solo las suyas con la dirección; resultado con fotos → 201 y auditoría; segundo registro → 409;
  otro inspector → 403; archivo que no es imagen, 0 o 6 fotos → 422
- [X] T021 [P] [US2] Prueba de integración `int/recorrido-ruta-b.e2e-spec.ts`: pago → EN_INSPECCION →
  favorable → licencia con certificado → FINALIZADO; otro expediente desfavorable → DENEGADO con motivo

### Implementación de la historia 2

- [X] T022 [US2] `ins/dominio/` (`inspeccion.ts`, `numero-certificado.ts`, puertos) y
  `ins/aplicacion/` (`crear-inspeccion.ts`, `asignar-inspector.ts`, `registrar-resultado.ts`,
  `listar-inspecciones.ts`). Deben pasar T018
- [X] T023 [US2] `seg/fachada.ts` `usuariosConRol(rol)` y `esUsuarioActivoConRol(id, rol)`;
  `tra/fachada.ts` `direccionDelLocal(numero)` y `resumenParaInspeccion(numero)` (giro, licencia)
- [X] T024 [US2] `ins/infraestructura/` (repositorio con `UPDATE` condicional y evento
  `ResultadoITSERegistrado`, fotos con el almacén compartido, manejador de `InspeccionRequerida`,
  adaptadores de fachadas) y `ins/presentacion/inspecciones.controller.ts` (`GET /inspecciones`,
  `GET /inspecciones/inspectores`, `POST …/asignar`, `POST …/resultado` multipart); `ins/fachada.ts`
  `resultadoDe(inspeccionId)`. Deben pasar T020
- [X] T025 [US2] `tra/aplicacion/aplicar-resultado-itse.ts` y su manejador; `AplicarPagoRegistrado`
  pasa la ruta B a EN_INSPECCION; `lic/aplicacion/registrar-certificado.ts` con su manejador de
  `CertificadoItseRegistrado`. Deben pasar T019 y T021
- [X] T026 [US2] Portal: `web/paginas/personal/Inspecciones.tsx` (jefatura asigna; inspector ve sus
  tarjetas) y `ResultadoInspeccion.tsx` (fotos con `capture`, vista previa, certificado si es
  favorable), rutas, menú "Inspecciones" y pruebas

**Punto de control**: las tres rutas avanzan con la inspección.

---

## Fase 5: Historia de usuario 3 - Feriados y plazos en días hábiles (P2)

**Objetivo**: feriados gestionados por el administrador y vencimientos en días hábiles con suspensión.

**Prueba independiente**: feriado un miércoles; expediente de 2 días presentado el martes → vence el
viernes; observar y subsanar corre el vencimiento.

### Pruebas de la historia 3 ⚠️

- [X] T027 [P] [US3] Pruebas unitarias `test-pla/dominio/calendario-habil.spec.ts` (fines de semana,
  feriados, cruce de año, fines de semana largos, restantes negativos y cero) y
  `test-pla/aplicacion/feriados.spec.ts` (fecha repetida, descripción de 1 a 150, alcance válido)
- [X] T028 [P] [US3] Pruebas unitarias en `test-tra/aplicacion/` del vencimiento al presentar (plazo
  NULL o 0 sin vencimiento), la suspensión al observar y al pasar a PENDIENTE_PAGO, la reanudación al
  subsanar y al pagar, el plazo para subsanar de 2 días hábiles y `completar-vencimientos` idempotente
- [X] T029 [P] [US3] Prueba de integración `int/feriados-plazos.e2e-spec.ts`: CRUD de feriados (ADMIN
  201/204, repetido 409, otro rol 403, listar con cualquier sesión), los 16 de 2026 sembrados, y el
  vencimiento real de un expediente presentado y observado

### Implementación de la historia 3

- [X] T030 [US3] `pla/dominio/calendario-habil.ts`, `feriado.ts` y puertos; `pla/aplicacion/feriados.ts`;
  `pla/fachada.ts` `sumarDiasHabiles` y `diasHabilesRestantes`. Deben pasar T027
- [X] T031 [US3] `pla/infraestructura/repositorio-feriados-postgres.ts` y
  `pla/presentacion/feriados.controller.ts` (`GET/POST /feriados`, `DELETE /feriados/{fecha}`)
- [X] T032 [US3] `tra/`: puerto `PlazosHabiles` con adaptador sobre `FachadaPlazos`; vencimiento en
  `PresentarSolicitud`; suspensión y reanudación en observar, subsanar, confirmar riesgo y aplicar pago;
  `plazo_subsanar_en` calculado; `completar-vencimientos.ts` al arrancar. Deben pasar T028 y T029
- [X] T033 [US3] Portal: `web/paginas/admin/Feriados.tsx` (año, lista, registrar y eliminar con
  confirmación en la página), ruta, menú "Feriados" y pruebas

**Punto de control**: los plazos se cuentan en días hábiles.

---

## Fase 6: Historia de usuario 4 - Alertas de plazos para la jefatura (P2)

**Objetivo**: reloj con una sola ejecución que genera alertas sin duplicar; página de alertas.

**Prueba independiente**: expediente que vence en 1 día hábil; reloj dos veces y en dos réplicas →
una alerta; jefatura la atiende.

### Pruebas de la historia 4 ⚠️

- [X] T034 [P] [US4] Pruebas unitarias `test-pla/aplicacion/generar-alertas.spec.ts` (2 o menos y
  vencidos sí; 3 o más no; estados sin plazo no) y `alertas.spec.ts` (orden por urgencia, atender una
  vez)
- [X] T035 [P] [US4] Prueba de integración `int/reloj-alertas.e2e-spec.ts`: una alerta por expediente y
  vencimiento aunque el reloj corra dos veces; **dos aplicaciones a la vez** contra la misma base → una
  sola ejecución y alertas sin duplicar (EQ-07); `GET /plazos/alertas` ordenado; atender → 200 y
  repetir → 409; otro rol → 403

### Implementación de la historia 4

- [X] T036 [US4] `pla/aplicacion/generar-alertas.ts` y `alertas.ts`; `tra/fachada.ts`
  `expedientesConPlazo()` y `estadosDe(numeros)`. Deben pasar T034
- [X] T037 [US4] `pla/infraestructura/repositorio-alertas-postgres.ts`, `reloj-plazos.ts` (candado
  `pg_try_advisory_xact_lock(4006001)`, `RELOJ_PLAZOS_INTERVALO_MS`, 0 en pruebas) y
  `pla/presentacion/alertas.controller.ts`. Deben pasar T035
- [X] T038 [US4] Portal: `web/paginas/personal/Alertas.tsx`, ruta, menú "Alertas" y pruebas

**Punto de control**: la jefatura ve las alertas.

---

## Fase 7: Historia de usuario 5 - Avisos al administrado (P3)

**Objetivo**: un aviso por cambio de estado y un aviso del ITSE por vencer, simulados, sin datos
personales.

**Prueba independiente**: aprobar un expediente de ruta A → un aviso por cambio; certificado que
vence en 29 días → un solo aviso aunque el reloj corra dos veces.

### Pruebas de la historia 5 ⚠️

- [ ] T039 [P] [US5] Pruebas unitarias `test-not/dominio/` (plantillas sin datos personales, canal
  CORREO o SMS) y `test-not/aplicacion/` (un aviso por evento, reintentos con espera creciente hasta 5,
  luego FALLIDO)
- [ ] T040 [P] [US5] Prueba de integración `int/avisos.e2e-spec.ts`: cambio de estado → un aviso
  cifrado y enviado al simulado (`dev:aviso:*`); evento repetido → un aviso; envío que falla →
  reintentos y FALLIDO; certificado que vence en 29 días → un solo `ITSE_POR_VENCER` con el reloj dos
  veces y con **dos aplicaciones a la vez** contra la misma base (SC-005)

### Implementación de la historia 5

- [ ] T041 [US5] `not/dominio/` (`aviso.ts`, `plantillas.ts`, puerto `EnviadorMensajes`) y
  `not/aplicacion/` (`crear-aviso.ts`, `enviar-avisos-pendientes.ts`); `tra/fachada.ts`
  `contactoTitular(numero)`. Deben pasar T039
- [ ] T042 [US5] `not/infraestructura/` (repositorio, `enviador-simulado-redis.ts`,
  `enviador-avisos.ts` con `AVISOS_INTERVALO_MS`, manejadores de `EstadoExpedienteCambiado` e
  `ItsePorVencer`); `lic/aplicacion/avisar-certificados-por-vencer.ts` llamado desde el reloj. Deben
  pasar T040

**Punto de control**: los avisos llegan (simulados).

---

## Fase 8: Acabado y temas transversales

- [ ] T043 [P] Prueba de integración `int/recorridos-006.e2e-spec.ts`: rutas A (hasta FINALIZADO), B
  (hasta FINALIZADO) y C (hasta LICENCIA_PROVISIONAL) desde la presentación, con historial, eventos y
  avisos (SC-003, SC-009)
- [ ] T044 [P] Prueba de integración `int/matriz-permisos-006.e2e-spec.ts`: cada endpoint nuevo con sin
  sesión 401 y cada rol que no corresponde 403, sin cambiar datos (SC-007)
- [ ] T045 [P] Prueba de integración `int/privacidad-006.e2e-spec.ts` con el logger capturador:
  registros, URL, errores, eventos, avisos, auditorías, verificación pública y PDF sin documento, RUC,
  celular, correo ni dirección del titular (la dirección solo para el inspector asignado y el detalle
  del personal) (SC-008)
- [ ] T046 Medir SC-001 (inspector registra el resultado con 2 fotos, ≤ 3 min) y SC-002 (jefatura
  asigna, ≤ 1 min) y el tiempo de la verificación pública (SC-006, ≤ 2 s) con un recorrido automatizado a 360 px en un clon aislado con datos ficticios; bajar
  el clon con `-v`. Sin k6, Lighthouse ni ZAP (quedan para el despliegue, 007)
- [ ] T047 Actualizar `README.md` (funcionalidad 006, con el recorrido completo de una licencia para
  probarlo a mano y los tiempos de T046) y `docs/03-diseno-de-software/diagrama-casos-de-uso.md`
  (CU08, CU09, CU10, CU15, CU17, CU18, CU19 y CU25 a "✅ Hecho")
- [ ] T048 Cadena completa de CI en local (`build`, `lint`, `formato`, `typecheck`, `test:unit`,
  `test:integracion` con PostgreSQL temporal en 5433 y Redis en 16379, pruebas del portal,
  `cobertura` ≥ 80 % por archivo en `dominio` y `aplicacion`, `regla-dependencia`, `contrato`) y
  gitleaks sin hallazgos. Sin push ni PR (los hace la usuaria)

---

## Dependencias y orden de ejecución

- Fase 1 → Fase 2 → historias. US1 antes que US2 (la ruta B emite su licencia con lo de US1). US3
  antes que US4 (las alertas usan los días hábiles). US5 puede ir después de US2. La fase 8 al final.
- Dentro de cada historia: pruebas (deben fallar) → dominio → aplicación → infraestructura y
  presentación → portal.

## Oportunidades de paralelismo

- T002 y T003; T006, T007 y T008; las pruebas [P] de cada historia entre sí; T043, T044 y T045.

## Estrategia

- **MVP**: fases 1 a 3 (licencia con QR y verificación para las rutas A y C).
- Luego US2 (inspecciones y ruta B), US3 y US4 (plazos y alertas) y US5 (avisos). Un commit por fase.
