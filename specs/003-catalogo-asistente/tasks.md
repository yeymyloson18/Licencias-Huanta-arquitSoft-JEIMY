---
description: "Lista de tareas de la funcionalidad 003: Catálogo y Asistente de ruta"
---

# Tareas: Catálogo y Asistente de ruta

**Entrada**: documentos de diseño de `specs/003-catalogo-asistente/`

**Prerrequisitos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: incluidas. Las exigen la constitución (principio V) y la especificación (SC-002, SC-003,
SC-005, SC-006 y SC-009; EQ-01, EQ-05 y EQ-06). En cada historia las pruebas se escriben primero y
deben fallar antes de implementar.

**Organización**: las tareas se agrupan por historia de usuario en el orden de la especificación:
US1 es P1, US2 y US3 son P2, y US4 es P3. Cada historia se puede probar sola. La ficha compartida y
la lectura completa de recetas están en la fase 2, y las pruebas de US4 cambian el estado `activa`
directamente en la base, sin depender del portal de US3.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[USn]**: historia de usuario de `spec.md` a la que pertenece la tarea.
- Las rutas son relativas a la raíz del repositorio. Se usan estas abreviaturas:
  - `cat/` = `apps/api/src/modulos/catalogo/`
  - `test-cat/` = `apps/api/test/unit/modulos/catalogo/`
  - `int/` = `apps/api/test/integracion/`
  - `web/` = `apps/web/src/`

## Convenciones para todas las tareas

- TypeScript `strict`, sin `any`, y nombres del dominio en español (principio IV).
- `cat/dominio/` y `cat/aplicacion/` no importan paquetes npm ni módulos `node:*`. La transacción,
  Redis, el reloj y los registros van detrás de los puertos de [data-model.md §4](./data-model.md).
  El cableado se hace en `cat/catalogo.module.ts` con `useFactory`.
- Desde otro módulo solo se importa `apps/api/src/modulos/seguridad/fachada.ts`: `RequiereRoles` y
  `UsuarioActual` (principio I).
- Ningún registro, respuesta ni mensaje de error incluye datos personales. Del administrador solo se
  usa `usuarioId` (FR-026, research §R-11).
- Toda respuesta HTTP de las pruebas de integración se valida con `esperarCumpleContrato`
  (`apps/api/test/apoyo/validarContrato.ts`). Las pruebas de integración se ejecutan con
  `npm run test:integracion` y una `DATABASE_URL` que apunta a un PostgreSQL temporal, nunca al stack
  principal.
- Los errores 422 usan `ErrorValidacion` (`apps/api/src/compartido/presentacion/filtro-problema.ts`)
  con `campo` según [contracts/openapi-cambios.md](./contracts/openapi-cambios.md). Los 401/403 los
  emiten los guards de la 002.
- Ningún texto de pregunta ni de opción, ningún monto y ningún requisito queda escrito en el código
  (FR-002, FR-012). El portal solo traduce las enumeraciones del contrato.

---

## Fase 1: Preparación (configuración y documentos de decisión)

**Propósito**: fijar el límite de 5 minutos de la caché antes de tocar el código del catálogo.

- [X] T001 Modificar `apps/api/src/compartido/infraestructura/configuracion.ts`. `CATALOGO_CACHE_TTL_SEGUNDOS` pasa a valer 240 por defecto y a admitir un **máximo de 240**; el error nombra la variable y explica "TTL de Redis + 60 s del navegador no puede superar 5 minutos" (research §R-06). Ampliar `apps/api/test/unit/compartido/configuracion.spec.ts` con tres casos: el valor por defecto 240, el valor 240 aceptado y el valor 241 rechazado con el nombre de la variable en el mensaje
  — *Nota de implementación: también se ajustaron a 240 s el TTL esperado en `int/catalogo.e2e-spec.ts` y en `test-cat/infraestructura/repositorio-catalogo-con-cache.spec.ts` (adelanta la parte de TTL de T028), para que la suite siga en verde con el nuevo valor por defecto.*
- [X] T002 [P] Cambiar `CATALOGO_CACHE_TTL_SEGUNDOS` a `240` en `.env.example` y el valor por defecto `${CATALOGO_CACHE_TTL_SEGUNDOS:-240}` en `infra/docker-compose.yml`. Cada uno lleva un comentario "máximo 240: Redis 240 s + navegador 60 s = 5 min (FR-024)"
- [X] T003 [P] En `docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md` (ADR-005, ajuste 1), reemplazar "5 minutos (`CATALOGO_CACHE_TTL_SEGUNDOS=300`) en lugar de 10" por "5 minutos en total en el peor caso: Redis 240 s (`CATALOGO_CACHE_TTL_SEGUNDOS=240`, máximo validado al arrancar) + 60 s de `Cache-Control` en el navegador; al guardar una receta se borran sus claves y el cambio se ve en la siguiente consulta (EQ-06, funcionalidad 003)"

---

## Fase 2: Base (prerrequisitos bloqueantes)

**Propósito**: contrato, migración y lectura completa de recetas que usan todas las historias.

**⚠️ CRÍTICO**: ninguna historia empieza antes de terminar esta fase.

### Contrato primero (principio II)

- [X] T004 Modificar `docs/06-contrato-api/openapi.yaml` exactamente según [contracts/openapi-cambios.md](./contracts/openapi-cambios.md):
  - **Operaciones nuevas** `listarRecetasAdmin` (`GET /admin/catalogo/recetas`) y `obtenerRecetaAdmin` (`GET /admin/catalogo/recetas/{codigoReceta}`), con `security: [{ bearerPersonal: [] }]`, 200/401/403 (y 404 en la segunda) y `Cache-Control: no-store`.
  - **Cabeceras de caché**: `listarRecetas` con `public, max-age=60`; `obtenerReceta` con 200 `public, max-age=60` y la descripción "404 si no existe o está desactivada"; `obtenerPreguntasAsistente` con `public, max-age=60`.
  - **`actualizarReceta`**: responde 200 `RecetaAdmin` con `no-store` y la descripción "Solo ADMINISTRADOR. Gana el último que guarda. Sin cambios: 200 sin registrar".
  - **`proponerLicencia`**: responde 200 `ResultadoAsistente` con `no-store`, y 422 solo para respuestas inválidas.
  - **Esquemas nuevos**: `RecetaAdminResumen`, `RecetaAdmin` y `ResultadoAsistente` (oneOf con `discriminator: resultado`; `motivo` ∈ `SIN_REGLA`, `RECETA_NO_DISPONIBLE`).
  - **`RecetaEditable`**:
    - `additionalProperties: false`;
    - `ordenItse` como `[string, 'null']`;
    - `plazoItseDias` como `[integer, 'null']` con `minimum: 1`;
    - `vigenciaMeses` con `minimum: 1`;
    - `requisitos` con `minItems: 1` y `maxItems: 30`, y cada elemento con `required: [descripcion, condicion]`, `additionalProperties: false`, `id` entero opcional, `orden` `deprecated`, y `descripcion` con `minLength: 1` y `maxLength: 500`.

  Ejecutar `npm run contrato` hasta llegar a 0 errores.
  — *Nota de implementación: `ResultadoAsistente` usa dos esquemas con nombre, `PropuestaLicencia` y `LicenciaNoDeterminada`, con `discriminator.mapping`, en lugar de variantes en línea: `redocly lint` (`no-illogical-composition-keywords`) daba 2 avisos nuevos. Quedan los mismos 7 avisos que antes de la 003. Se actualizaron [contracts/openapi-cambios.md](./contracts/openapi-cambios.md) y el conteo de esquemas de plan.md (5 nuevos). El `Cache-Control` de la lista sigue en `max-age=300` en el código hasta T030, como estaba previsto.*
- [X] T005 [P] Actualizar `docs/06-contrato-api/README.md`:
  - agregar `listarRecetasAdmin` y `obtenerRecetaAdmin` a la fila de Catálogo de "Operaciones por módulo" y sumarlas al total del encabezado;
  - explicar las dos formas de `ResultadoAsistente`;
  - documentar la regla "propagación máxima 5 min = Redis 240 s + `max-age=60`".
- [X] T006 Regenerar los tipos de `packages/contracts` (el script de generación de la 001) y comprobar que `npm run typecheck` pasa en `apps/api` y `apps/web`. Si alguna referencia de la 001 rompe, corregirla en su archivo; por ejemplo, el `Cache-Control` de `cat/presentacion/catalogo.controller.ts` se cambia en US2 (T029)

### Modelo de datos (migración 0004, principio III)

- [X] T007 Crear `apps/api/prisma/migrations/0004_catalogo_asistente/migration.sql` según [data-model.md §1](./data-model.md), con comentarios en español que citen FR y research:
  - `CREATE TABLE catalogo.cambio_receta` con `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `codigo_receta varchar(10) NOT NULL REFERENCES catalogo.receta (codigo)`, `usuario_id uuid NOT NULL` (sin FK, MD2), `cambiado_en timestamptz NOT NULL DEFAULT now()` y `cambios jsonb NOT NULL CHECK (jsonb_typeof(cambios) = 'object' AND cambios <> '{}'::jsonb)`;
  - el índice `ix_cambio_receta_receta (codigo_receta, cambiado_en)`;
  - borrar y volver a crear con el **mismo nombre** la restricción única `(codigo_receta, orden)` de `catalogo.requisito` como `DEFERRABLE INITIALLY DEFERRED`;
  - `UPDATE catalogo.pregunta_asistente SET opciones = opciones || '[{"valor":"NO_SE","texto":"No lo sé"}]'::jsonb WHERE codigo = 'NIVEL_RIESGO'`.
- [X] T008 [P] Actualizar `docs/05-modelo-de-datos/esquema.sql` con el estado actual: la tabla `catalogo.cambio_receta`, su índice dentro de su `CREATE TABLE`/`CREATE INDEX` y `UNIQUE (codigo_receta, orden) DEFERRABLE INITIALLY DEFERRED` en `catalogo.requisito`, todo sin `ALTER`
- [X] T009 [P] Actualizar `docs/05-modelo-de-datos/datos-semilla.sql` para que la pregunta `NIVEL_RIESGO` tenga la opción `{"valor":"NO_SE","texto":"No lo sé"}` al final de sus opciones. El archivo pasa a describir los datos semilla **actuales**: agregar en la cabecera "estado después de todas las migraciones (research §R-08 de la 003)"
- [X] T010 [P] Actualizar `docs/05-modelo-de-datos/modelo-entidad-relacion.md`: la entidad `CAMBIO_RECETA` y su relación `RECETA ||--o{ CAMBIO_RECETA` en el diagrama Mermaid, y en el diccionario del esquema `catalogo` la fila "`cambio_receta`: registro inmutable de cada modificación de una receta (quién, cuándo, antes y después en `cambios`), `usuario_id` sin FK (MD2)". Anotar también que la restricción única de `requisito` es diferible
- [X] T011 Modificar `apps/api/test/unit/migraciones.spec.ts`. Reemplazar la comparación `0002 == datos-semilla.sql` por una prueba que fije el SHA-256 del contenido actual de `prisma/migrations/0002_datos_semilla/migration.sql` (normalizando `\r\n`), con el mensaje "0002 ya está aplicada: no se edita; cree una migración nueva y actualice docs/05-modelo-de-datos/datos-semilla.sql". Actualizar el comentario de cabecera para que cite research §R-08 de la 003
- [X] T012 Ampliar `int/esquema-equivalente.e2e-spec.ts` para que, además de la estructura, compare **datos** entre la base de referencia (`esquema.sql` + `datos-semilla.sql`) y la base migrada. Se comparan `catalogo.receta` (sin `actualizada_por` ni `actualizada_en`), `catalogo.requisito` (sin `id`), `catalogo.pregunta_asistente`, `catalogo.regla_asistente` (sin `id`) y `seguridad.rol`, fila por fila y ordenados por clave natural. El mensaje de fallo nombra la tabla y la primera fila distinta
- [X] T013 Aplicar las migraciones en un PostgreSQL temporal (`npx prisma migrate deploy` en `apps/api`) y regenerar `apps/api/prisma/schema.prisma` con `npx prisma db pull`, conservando los nombres de modelo y los `@@map` existentes (por ejemplo, `Receta`). Después, `npx prisma generate`; comprobar que `npm run typecheck`, T011 y T012 pasan

### Lectura completa de recetas (compartida por US1, US2 y US3)

- [X] T014 [P] Pruebas unitarias en `test-cat/dominio/receta-completa.spec.ts` y `test-cat/dominio/requisito.spec.ts`:
  - `crearRecetaCompleta(datos)` construye las 12 recetas de la semilla y conserva los requisitos en orden;
  - `Requisito` acepta las condiciones `SIEMPRE`, `CON_REPRESENTANTE`, `GIRO_ESPECIAL` y `SIN_PLANOS_VIGENTES` y rechaza otra;
  - la descripción, de 1 a 500 caracteres tras `trim`, se rechaza vacía o con 501;
  - `aDatosRecetaCompleta` es la operación inversa, para la caché.
- [X] T015 [P] Crear en `cat/dominio/` los archivos que hacen pasar T014: `requisito.ts` (`Requisito`, `CondicionRequisito`, `CONDICIONES_REQUISITO`) y `receta-completa.ts` (`RecetaCompleta` con los campos de [data-model.md §2](./data-model.md), más `TipoPlazo`, `Calificacion`, `OrdenItse` y `NivelRiesgo` como uniones de literales). Reutilizan `Tasa`, `PlazoDiasHabiles` y `CodigoReceta`; `receta.ts` (resumen de la 001) no cambia
  — *Nota de implementación: en `datos-semilla.sql` los tres trámites conectados (TRF-01, CGI-01 y DUP-01) no tienen requisitos, aunque el documento 09 sí se los asigna; la lectura acepta 0 requisitos. Afecta la regla "receta sin requisitos" de FR-019 en US3 (ver el informe de la fase 2).*
- [X] T016 Ampliar el puerto `cat/dominio/repositorio-catalogo.ts` con `obtener(codigo): Promise<RecetaCompleta | null>`, que devuelve la receta activa o no, y `listarTodas(): Promise<RecetaCompleta[]>`. Implementarlos en `cat/infraestructura/repositorio-catalogo-postgres.ts`: requisitos ordenados por `orden` y la misma validación de frontera que `listarActivas`. Implementar `obtener` en `cat/infraestructura/repositorio-catalogo-con-cache.ts` con la clave `catalogo:receta:<CODIGO>` y el TTL de la configuración; si Redis falla, se lee de la base. `listarTodas` va sin caché, porque es solo para administración. Agregar casos a `test-cat/infraestructura/repositorio-catalogo-con-cache.spec.ts` (acierto, fallo y Redis caído) y a `int/catalogo.e2e-spec.ts` (`obtener('LIC-03')` devuelve 8 o más requisitos en orden)
  — *Nota de implementación: el doble `RepositorioEnMemoria` de `test-cat/aplicacion/listar-recetas.spec.ts` se completó con `obtener` y `listarTodas`. Las pruebas usan `test-cat/apoyo/semilla-catalogo.ts`, que lee las 12 recetas y sus requisitos de `datos-semilla.sql`; T034 lo reutilizará.*
- [X] T017 [P] Prueba `web/componentes/FichaLicencia.test.tsx` y componente `web/componentes/FichaLicencia.tsx`, según la tabla de [contracts/portal-catalogo.md](./contracts/portal-catalogo.md):
  - tasa `S/ 177.10`, o "Gratuito" si es `0.00`;
  - plazo con su tipo de días;
  - calificación en lenguaje sencillo;
  - ITSE "Posterior, hasta 9 días hábiles" / "Previa, hasta 7 días hábiles" / "Se notifica dentro de 6 meses";
  - vigencia "Indeterminada" / "Provisional de 12 meses", omitida en los trámites conectados;
  - requisitos en `<ol>`, con las etiquetas "Solo si actúa un representante", "Solo si tu giro lo exige" y "No se pide si presentaste planos en los últimos 5 años y la edificación no cambió".

  Agregar los formateadores que falten en `web/componentes/formato.ts` (con su caso en `formato.test.ts`) y el tipo `Receta` exportado desde `web/servicios/clienteApi.ts`

**Punto de control**: el contrato pasa la validación, las migraciones y los documentos son equivalentes, y la receta completa se lee desde la caché. Las historias pueden empezar.

---

## Fase 3: Historia de usuario 1 - Descubrir qué licencia me corresponde (Prioridad: P1) 🎯 MVP

**Objetivo**: asistente público de tres preguntas que propone una licencia con su ficha, o avisa que
no se pudo determinar.

**Prueba independiente**: sin sesión, recorrer las 30 combinaciones y comprobar la licencia esperada
o `NO_DETERMINADA` ([contracts/asistente.md](./contracts/asistente.md)); en el portal, "Volver" y
"Empezar de nuevo" funcionan y la URL sobrevive a una recarga.

### Pruebas de la historia 1 ⚠️

- [X] T018 [P] [US1] Prueba unitaria `test-cat/dominio/motor-reglas-asistente.spec.ts`:
  - **Tabla `it.each` de las 30 combinaciones** (3 × 2 × 5) con las preguntas y reglas de la semilla, cargadas como datos de la prueba, y el resultado esperado de la tabla de verdad de [contracts/asistente.md](./contracts/asistente.md). En particular, `OTRO` + `SI` + `BAJO` da `LIC-01` y `OTRO` + cualquiera + `NO_SE` da `NO_DETERMINADA / SIN_REGLA`.
  - **`validarRespuestas`** detecta tres errores, cada uno con su código de pregunta: una pregunta faltante, un código desconocido y un valor fuera de las opciones.
  - **La prioridad manda** sobre el orden en que llegan las reglas.
  - **Una regla sin condiciones** coincide con cualquier respuesta.
  — *Nota de implementación: las preguntas y reglas se leen de `datos-semilla.sql` con `leerSemillaAsistente` (`test-cat/apoyo/semilla-catalogo.ts`), así la tabla de 30 combinaciones prueba los datos reales. `proponerLicencia` valida las respuestas y lanza `ErrorRespuestasInvalidas` con todos los errores.*
- [X] T019 [P] [US1] Prueba unitaria `test-cat/aplicacion/proponer-licencia.spec.ts` con dobles del repositorio:
  - con respuestas válidas y la receta activa → `PROPUESTA` con la receta completa;
  - si la primera regla apunta a una receta desactivada → `NO_DETERMINADA / RECETA_NO_DISPONIBLE`, **sin** evaluar la regla siguiente (el doble verifica que solo se pidió esa receta);
  - con respuestas inválidas → error de validación con `campo = respuestas.<CODIGO>`.

  Prueba `test-cat/aplicacion/obtener-preguntas.spec.ts`: devuelve las preguntas ordenadas por `orden`.
  — *Nota de implementación: se agregó el doble `test-cat/apoyo/repositorio-catalogo-falso.ts` (cargado con la semilla y con `desactivar(codigo)`), reutilizable en US2 a US4.*
- [X] T020 [P] [US1] Prueba de integración `int/asistente.e2e-spec.ts`, que borra antes las claves `catalogo:*`. Cada respuesta se valida contra el contrato.
  - **`GET /asistente/preguntas`**:
    - 3 preguntas;
    - `NIVEL_RIESGO` con 5 opciones, la última `NO_SE`;
    - `Cache-Control: public, max-age=60`.
  - **`POST /asistente/proponer`**:
    - `OTRO/NO/MEDIO` → 200 `PROPUESTA` `LIC-02` `tasa=177.10`;
    - `BODEGA/NO/BAJO` → `LIC-09` `tasa=0.00`;
    - `OTRO/NO/NO_SE` → 200 `NO_DETERMINADA` `SIN_REGLA`;
    - sin `NIVEL_RIESGO` → 422 `campo=respuestas.NIVEL_RIESGO`;
    - `NIVEL_RIESGO=ENORME` → 422;
    - cuerpo sin `respuestas` → 422 `campo=respuestas`;
    - la respuesta lleva `Cache-Control: no-store`.
  - **EQ-06**: tras `UPDATE catalogo.receta SET tasa = 180.00 WHERE codigo = 'LIC-02'` directo en la base y borrar `catalogo:receta:LIC-02`, la propuesta muestra `180.00` sin reiniciar; restaurar el valor en `afterEach`.

### Implementación de la historia 1

- [X] T021 [P] [US1] Crear `cat/dominio/pregunta-asistente.ts` (`PreguntaAsistente`, `OpcionPregunta`, `ReglaAsistente`) y `cat/dominio/motor-reglas-asistente.ts`. Este último tiene `validarRespuestas(preguntas, respuestas): ErrorRespuesta[]` y `proponerLicencia(preguntas, reglas, respuestas): ResultadoMotor`: ordena por prioridad ascendente, toma la primera regla cuyas condiciones son todas iguales a las respuestas y devuelve `PROPUESTA` con el código, o `NO_DETERMINADA / SIN_REGLA` (research §R-02). Debe hacer pasar T018
- [X] T022 [US1] Ampliar el puerto `cat/dominio/repositorio-catalogo.ts` con `obtenerAsistente(): Promise<{ preguntas: PreguntaAsistente[]; reglas: ReglaAsistente[] }>`:
  - en `repositorio-catalogo-postgres.ts`, leer `pregunta_asistente` ordenada por `orden` y `regla_asistente` ordenada por `prioridad`, y validar en la frontera que `opciones` es un arreglo de `{ valor, texto }` y que `condiciones` es un objeto de textos;
  - en `repositorio-catalogo-con-cache.ts`, guardar el resultado en la clave `catalogo:asistente`;
  - agregar los casos de caché a `test-cat/infraestructura/repositorio-catalogo-con-cache.spec.ts`.
- [X] T023 [US1] Crear `cat/aplicacion/obtener-preguntas.ts` y `cat/aplicacion/proponer-licencia.ts`. `ProponerLicencia` valida las respuestas, ejecuta el motor y, si hay propuesta, llama a `repositorio.obtener(codigo)`; si la receta es `null` o tiene `activa=false`, devuelve `NO_DETERMINADA / RECETA_NO_DISPONIBLE`. Ninguno de los dos registra las respuestas (FR-009). Deben hacer pasar T019
- [X] T024 [US1] Crear `cat/presentacion/asistente.controller.ts` con:
  - `GET asistente/preguntas` (`Cache-Control: public, max-age=60`);
  - `POST asistente/proponer`, que valida con zod la forma `{ respuestas: Record<string, string> }` (422 `campo=respuestas`), traduce los errores de dominio a `ErrorValidacion` con `campo=respuestas.<CODIGO>`, responde `ResultadoAsistente` con `Cache-Control: no-store` y mapea la receta al esquema `Receta`, con requisitos `{ id, orden, descripcion, obligatorio, condicion }`.

  Registrar el controlador y los casos de uso con `useFactory` en `cat/catalogo.module.ts`. Debe hacer pasar T020
  — *Nota de implementación: `cat/presentacion/mapear-receta.ts` se creó aquí y no en T030, como sugería el hallazgo O1 del análisis; T030 solo debe reutilizarlo.*
- [X] T025 [P] [US1] Agregar a `web/servicios/clienteApi.ts` las funciones `obtenerPreguntas()` y `proponerLicencia(respuestas)`, con los tipos `PreguntaAsistente` y `ResultadoAsistente` del contrato; si el servicio no está disponible, lanzan `CatalogoNoDisponible`
  — *Nota de implementación: las tres lecturas públicas comparten `leerCatalogo` (límite de 10 s y `CatalogoNoDisponible`); `listarLicencias` conserva su comportamiento.*
- [X] T026 [US1] Prueba `web/paginas/Asistente.test.tsx` y página `web/paginas/Asistente.tsx`, según [contracts/portal-catalogo.md](./contracts/portal-catalogo.md):
  - el estado vive en la query (`useSearchParams`) y se descartan los parámetros desconocidos o inválidos;
  - una pregunta por pantalla, con su `<h1>` enfocado al llegar, "Pregunta N de M" en `aria-live="polite"` (M = número de preguntas recibidas de la API, **nunca un 3 fijo**; FR-002, FR-003) y las opciones como `radio` en un `fieldset`/`legend`;
  - "Siguiente" está deshabilitado sin opción; "Volver" quita la última respuesta y deja marcada la anterior; "Empezar de nuevo" limpia la URL;
  - con las 3 respuestas: `FichaLicencia` más el aviso orientativo (FR-008), o el mensaje único de `NO_DETERMINADA` con la sugerencia de ir a la Subgerencia;
  - si el servicio no está disponible, mensaje con "Reintentar"; mientras carga, los botones quedan desactivados.

  Las pruebas cubren todo lo anterior, incluida la recarga con la URL a medias, y un caso con 2 y otro con 4 preguntas falsas que comprueba que el avance dice "de 2" y "de 4" y que la propuesta se pide al responder la última
  — *Nota de implementación: la pregunta va en un `<div>` y "Siguiente" es `type="button"`: un `<form>` con envío falla en jsdom con React 19 (`FormData` con `submitter`) y no aporta nada, porque no se envía un formulario. Los textos del asistente tutean, igual que las preguntas del catálogo. El `<h1>` de cada pregunta va dentro del `<legend>`, así el grupo de opciones queda nombrado por la pregunta.*
- [X] T027 [US1] Agregar la ruta pública `/asistente` en `web/Aplicacion.tsx` y el botón "¿Qué licencia necesito?" en `web/paginas/Inicio.tsx`, que lleva a `/asistente`. Actualizar `web/paginas/Inicio.test.tsx`

**Punto de control**: la historia 1 funciona sola. Es el MVP: un ciudadano descubre su licencia desde el celular.

---

## Fase 4: Historia de usuario 2 - Consultar el detalle de cualquier licencia (Prioridad: P2)

**Objetivo**: ficha pública de cada receta activa; una receta desactivada responde 404.

**Prueba independiente**: sin sesión, abrir las 12 fichas y compararlas con el documento 09; una
receta desactivada directamente en la base muestra "no disponible".

### Pruebas de la historia 2 ⚠️

- [ ] T028 [P] [US2] Ampliar `int/catalogo.e2e-spec.ts`:
  - **Lista**:
    - cambiar la prueba de `Cache-Control` de la lista a `public, max-age=60`;
    - cambiar la del TTL de Redis a "≤ 240" (el comentario "equivale a que venza el TTL de 300 s" pasa a 240);
    - con `activa=false` en `LIC-06` (puesto directo en la base y restaurado en `afterEach`), la lista no la incluye.
  - **Ficha**:
    - `GET /catalogo/recetas/LIC-03` → 200 con `public, max-age=60`, `tasa=305.90`, `calificacion=EVALUACION_PREVIA_SILENCIO_POSITIVO`, `ordenItse=PREVIA`, `plazoItseDias=7`, `vigenciaMeses=null` y los requisitos en orden;
    - SC-003: tabla `it.each` con las 12 recetas y su tasa, plazo, calificación, orden y plazo del ITSE, y vigencia, según `docs/01-analisis-de-sistema/09-validacion-del-tupa.md`;
    - `LIC-06` desactivada → 404 con `no-store`;
    - `XYZ-01` → 422.
  - Todas las respuestas se validan contra el contrato.
- [ ] T029 [P] [US2] Prueba unitaria `test-cat/aplicacion/obtener-ficha.spec.ts`: una receta activa se devuelve, mientras que una desactivada o inexistente da `null`

### Implementación de la historia 2

- [ ] T030 [US2] Crear `cat/aplicacion/obtener-ficha.ts` (`ObtenerFicha`: devuelve la receta solo si `activa`). En `cat/presentacion/catalogo.controller.ts`:
  - agregar `GET catalogo/recetas/:codigoReceta`, que valida el formato con `CodigoReceta` (422) y responde 200 `Receta` con `public, max-age=60`, o 404 con `no-store` si no está;
  - cambiar `CACHE_HTTP` de la lista a `public, max-age=60`;
  - extraer a `cat/presentacion/mapear-receta.ts` el mapeo de `RecetaCompleta` → `Receta` para reutilizarlo en T024 y T046.

  Registrar el caso de uso en `cat/catalogo.module.ts`. Debe hacer pasar T028 y T029
- [ ] T031 [P] [US2] Agregar `obtenerFicha(codigo)` a `web/servicios/clienteApi.ts`; devuelve `null` si recibe 404
- [ ] T032 [US2] Prueba `web/paginas/Licencia.test.tsx` y página `web/paginas/Licencia.tsx` (`/licencias/:codigo`): muestra `FichaLicencia`; con un 404, "Esta licencia no está disponible" y un enlace al inicio; si el servicio no está disponible, mensaje con "Reintentar"
- [ ] T033 [US2] Agregar la ruta pública `/licencias/:codigo` en `web/Aplicacion.tsx` y convertir cada `TarjetaLicencia` (`web/componentes/TarjetaLicencia.tsx`) en un enlace a su ficha, manteniendo la semántica de lista. Actualizar las pruebas de `Inicio`

**Punto de control**: las historias 1 y 2 funcionan, cada una por su lado.

---

## Fase 5: Historia de usuario 3 - Actualizar una receta cuando cambia el TUPA (Prioridad: P2)

**Objetivo**: edición solo para ADMINISTRADOR, con validación de dominio, registro atómico de antes y
después, e invalidación de la caché.

**Prueba independiente**: con un administrador de prueba, cambiar la tasa y un requisito de `LIC-02`,
ver el cambio al instante en la ficha y en el asistente, encontrar la fila de `cambio_receta` y
comprobar que no se tocó código.

### Pruebas de la historia 3 ⚠️

- [ ] T034 [P] [US3] Prueba unitaria `test-cat/dominio/coherencia-ruta.spec.ts`. Recorre la tabla `COHERENCIA_POR_RUTA` de [data-model.md §2](./data-model.md):
  - **Ruta A**: `APROBACION_AUTOMATICA` + `POSTERIOR` + plazo del ITSE ≥ 1.
  - **Ruta B**: `EVALUACION_PREVIA_SILENCIO_POSITIVO` + `PREVIA` + plazo del ITSE ≥ 1.
  - **Ruta C**: `APROBACION_AUTOMATICA` + `DENTRO_6_MESES` + plazo del ITSE null.
  - **Trámite conectado**: sin ITSE ni vigencia, calificación `APROBACION_AUTOMATICA` o `SERVICIO_EXCLUSIVO`.

  Incluye un caso que lee `docs/05-modelo-de-datos/datos-semilla.sql`, extrae las 12 recetas y comprueba que todas cumplen la tabla.
- [ ] T035 [P] [US3] Prueba unitaria `test-cat/dominio/aplicar-cambios.spec.ts`:
  - **Diferencias**:
    - tasa `177.10` → `180.00` da `{ tasa: { antes: "177.10", despues: "180.00" } }`;
    - los mismos valores dan diferencias vacías;
    - la vigencia `null` → 12 se detecta;
    - `requisitos` reemplaza la lista y el orden final es 1…n según la posición, ignorando el `orden` recibido;
    - un requisito con `id` conserva su `id` y uno sin `id` queda como nuevo;
    - la diferencia de `requisitos` lleva las listas completas sin `id`.
  - **Rechazos** (con `ErrorValidacionReceta` que trae **todos** los errores a la vez, cada uno con su `campo`):
    - tasa `-1.00`, `1.005`, `abc` o mayor que `99999999.99`;
    - plazo 0;
    - plazo del ITSE 0;
    - vigencia 0;
    - lista vacía, o con 31 requisitos;
    - descripción vacía tras `trim`, o con 501 caracteres;
    - `id` que no pertenece a la receta, o repetido;
    - ruta A con `EVALUACION_PREVIA_SILENCIO_POSITIVO`, licencia con `ordenItse=null`, o trámite conectado con `vigenciaMeses`.
  - **Recorte**: los espacios al inicio y al final de una descripción se recortan.
- [ ] T036 [P] [US3] Prueba unitaria `test-cat/aplicacion/actualizar-receta.spec.ts`, con dobles de `UnidadDeTrabajoCatalogo`, `InvalidadorCacheCatalogo` y `Reloj`:
  - con cambios → guarda la receta y el registro con `usuarioId` y `cambiadoEn`, y después invalida la caché;
  - sin cambios → no guarda, no registra y no invalida;
  - con errores de dominio → no guarda;
  - receta inexistente → error "no encontrada";
  - si la invalidación falla → el caso de uso termina bien.

  Pruebas `test-cat/aplicacion/listar-recetas-admin.spec.ts` y `test-cat/aplicacion/obtener-receta-admin.spec.ts`: incluyen las desactivadas.
- [ ] T037 [P] [US3] Prueba de integración `int/matriz-permisos-catalogo.e2e-spec.ts`, con `clienteConRoles` de `apps/api/test/apoyo/admin-prueba.ts`. Para `GET /admin/catalogo/recetas`, `GET /admin/catalogo/recetas/LIC-02` y `PUT /catalogo/recetas/LIC-02`:
  - sin token → 401;
  - con cada uno de los roles `MESA_PARTES`, `EVALUADOR`, `INSPECTOR`, `CAJA` y `JEFATURA` → 403;
  - `ADMINISTRADOR` → 200.

  - **Rol retirado durante la edición** (caso límite de la spec): un administrador de prueba obtiene su token, otro administrador le retira el rol con `PUT /usuarios/{id}/roles` (o directamente con la regla de la 002) y el PUT de la receta con el **mismo token** responde 403 sin cambiar nada (efecto inmediato de la 002).

  En los casos 401/403 la receta no cambia ni se agregan filas a `cambio_receta`. Todas las respuestas se validan contra el contrato.
- [ ] T038 [P] [US3] Prueba de integración `int/catalogo-admin.e2e-spec.ts`. Cada prueba restaura `LIC-01`/`LIC-02` y vacía `cambio_receta` en `afterEach`.
  - **Lectura de administración**: `GET /admin/catalogo/recetas` → 12 recetas con `activa` y `actualizadaEn`, y `Cache-Control: no-store`.
  - **Cambio de tasa**: `PUT LIC-02 {"tasa":"180.00"}` → 200 `RecetaAdmin` con `tasa=180.00`. Hay una fila en `cambio_receta` con `usuario_id` igual al del administrador de prueba y `cambios={"tasa":{"antes":"177.10","despues":"180.00"}}`, y `receta.actualizada_por` igual a ese usuario.
  - **PUT idéntico**: 200 y la cuenta de filas no cambia.
  - **Errores juntos**: `{"tasa":"-1.00","requisitos":[]}` → 422 con errores en `tasa` y en `requisitos`, sin cambios ni filas nuevas.
  - **Coherencia con la ruta**: `PUT LIC-01 {"calificacion":"EVALUACION_PREVIA_SILENCIO_POSITIVO"}` → 422 `campo=calificacion`.
  - **Campos no editables**: `{"nombre":"X"}` y `{"ruta":"B"}` → 422.
  - **Reorden**: mover el tercer requisito de `LIC-01` al primer lugar con sus `id` → la ficha pública muestra el orden nuevo y conserva los mismos `id`.
  - **Agregar requisito**: uno sin `id` aparece con un `id` nuevo.
  - **`id` ajeno**: un `id` de requisito de otra receta → 422 `campo=requisitos[0].id`.
  - **Atomicidad**: si se fuerza un fallo al insertar el registro (por ejemplo, con un doble que lanza dentro de la unidad de trabajo, o con un `CHECK` temporal en la base de prueba), ni la receta ni los requisitos cambian.
  - **Datos personales**: el logger capturador de la 002 no recibe el correo ni el nombre del administrador, y las líneas solo llevan `codigo` y `usuarioId`.
- [ ] T039 [P] [US3] Prueba de integración `int/cache-catalogo.e2e-spec.ts`:
  - **Invalidación**: llenar la caché leyendo la ficha y la lista de `LIC-02`, hacer el PUT de la tasa, y comprobar que la siguiente lectura ya muestra el valor nuevo y que se borraron `catalogo:receta:LIC-02` y `catalogo:recetas:*`.
  - **Peor caso**: con un cliente Redis falso cuyo `del` falla (sobrescribiendo el proveedor `REDIS_CLIENTE` en el módulo de prueba), el PUT responde 200, se registra un aviso y la clave conserva un TTL de 240 s o menos; el `Cache-Control` público es `max-age=60`. Así el máximo es de 300 s.
- [ ] T040 [P] [US3] Prueba de integración `int/guardado-concurrente-receta.e2e-spec.ts`: dos PUT simultáneos sobre `LIC-02` (`tasa` 180.00 y 190.00) responden 200 los dos y dejan 2 filas en `cambio_receta`; el "antes" de la segunda es el "después" de la primera, y la tasa final es la del último en confirmar. Con `timeout` explícito de 60 000 ms

### Implementación de la historia 3

- [ ] T041 [P] [US3] Crear `cat/dominio/coherencia-ruta.ts` (`COHERENCIA_POR_RUTA` como datos y `verificarCoherencia(receta): ErrorCampo[]`). Debe hacer pasar T034
- [ ] T042 [US3] Crear en `cat/dominio/` los archivos `cambios-receta.ts` (`CambiosReceta`), `diferencia-receta.ts` (`DiferenciaReceta`, que compara por valor; la tasa se compara en céntimos) y `error-validacion-receta.ts` (`ErrorValidacionReceta`, con la lista `{ campo, mensaje }` y mensajes sin datos personales). Agregar `aplicarCambios(receta, cambios)` a `receta-completa.ts`; se apoya en T041 y en los límites de research §R-03. Debe hacer pasar T035
- [ ] T043 [P] [US3] Crear los puertos en `cat/dominio/`:
  - `unidad-de-trabajo-catalogo.ts`: `ejecutar<T>(codigo, trabajo: (receta: RecetaCompleta) => { guardar: { receta: RecetaCompleta; diferencias: DiferenciaReceta; usuarioId: string; en: Date } | null; resultado: T }): Promise<T | null>`, que devuelve `null` si la receta no existe;
  - `invalidador-cache-catalogo.ts`: `invalidar(codigo): Promise<void>`;
  - `reloj.ts`: `ahora(): Date`.
- [ ] T044 [US3] Crear en `cat/aplicacion/` los casos de uso `actualizar-receta.ts` (`ActualizarReceta.ejecutar(codigo, cambios, usuarioId)`), `listar-recetas-admin.ts` y `obtener-receta-admin.ts`. `ActualizarReceta` usa la unidad de trabajo con `aplicarCambios`, invalida la caché **después** de confirmar solo si hubo cambios y devuelve `RecetaCompleta` o "no encontrada". Deben hacer pasar T036
- [ ] T045 [US3] Crear `cat/infraestructura/unidad-de-trabajo-catalogo-postgres.ts`, que trabaja con `prisma.$transaction` (research §R-04 y §R-05):
  - `SELECT … FROM catalogo.receta WHERE codigo = $1 FOR UPDATE` (con `$queryRaw` y parámetros), y lectura de sus requisitos;
  - ejecuta el trabajo; si devuelve `guardar`:
    - `UPDATE` de los campos editables de la receta, más `actualizada_por` y `actualizada_en`;
    - para los requisitos, `UPDATE` de los que tienen `id`, `INSERT` de los nuevos y `DELETE` de los que faltan (la restricción diferible permite reordenar);
    - `INSERT` en `catalogo.cambio_receta` con `cambios` en jsonb.

  Si algo falla, se revierte todo. Crear también `cat/infraestructura/invalidador-cache-catalogo-redis.ts`, que hace `DEL` de `catalogo:receta:<CODIGO>`, `catalogo:recetas:TODOS`, `:LICENCIA` y `:TRAMITE_CONECTADO`; si falla, `Logger.warn('Caché del catálogo no disponible al invalidar codigo=<CODIGO>')` y no lanza. Y `cat/infraestructura/reloj-sistema.ts`
- [ ] T046 [US3] Crear `cat/presentacion/catalogo-admin.controller.ts`, protegido con `@RequiereRoles('ADMINISTRADOR')` de la fachada de seguridad y con `Cache-Control: no-store` en todas las respuestas:
  - `GET admin/catalogo/recetas` → `RecetaAdminResumen[]`;
  - `GET admin/catalogo/recetas/:codigoReceta` → `RecetaAdmin` o 404;
  - `PUT catalogo/recetas/:codigoReceta`: valida con zod la forma de `RecetaEditable` (`.strict()`, `minProperties: 1`, `Soles` `^[0-9]+\.[0-9]{2}$`) en `cat/presentacion/esquemas-catalogo.ts`, toma el usuario con `@UsuarioActual()` y traduce `ErrorValidacionReceta` a `ErrorValidacion`. Registra con `Logger` la línea `receta actualizada codigo=<CODIGO> usuarioId=<id> campos=<lista de nombres>`, sin valores.

  Comprobar que el PUT protegido no rompe el GET público de la misma ruta en `catalogo.controller.ts`. Cablear todo con `useFactory` en `cat/catalogo.module.ts`, inyectando `PrismaServicio`, `REDIS_CLIENTE` y `CONFIGURACION`. Debe hacer pasar T037 a T040
- [ ] T047 [P] [US3] Agregar a `web/servicios/clienteApi.ts` las funciones `listarRecetasAdmin()`, `obtenerRecetaAdmin(codigo)` y `actualizarReceta(codigo, cambios)`. Esta última devuelve `ResultadoOperacion` como en la 002, con los `errores[]` del 422 por campo, y usa el middleware de `Authorization` existente
- [ ] T048 [US3] Prueba `web/paginas/admin/Catalogo.test.tsx` y página `web/paginas/admin/Catalogo.tsx`: la lista de las 12 recetas con su código, nombre, tasa, plazo y el estado "Activa" o "Desactivada", y un enlace a la edición de cada una
- [ ] T049 [US3] Prueba `web/paginas/admin/EditarReceta.test.tsx` y página `web/paginas/admin/EditarReceta.tsx`, según [contracts/portal-catalogo.md](./contracts/portal-catalogo.md):
  - datos fijos en solo lectura;
  - campos editables, con los selects de calificación e ITSE limitados a lo válido para la ruta;
  - lista de requisitos con agregar, quitar, subir y bajar, texto con `maxLength=500`, obligatorio y condición, enviando el `id` de los existentes;
  - la tasa se normaliza a 2 decimales antes de comparar y enviar (`180` → `180.00`, `180.5` → `180.50`), porque el contrato `Soles` exige `^[0-9]+\.[0-9]{2}$`; un texto no numérico o con más de 2 decimales se marca en el campo sin llamar a la API;
  - "No hay cambios para guardar" sin llamar a la API (comparando ya con la tasa normalizada);
  - los 422 se muestran junto a cada campo (`aria-describedby`, incluido `requisitos[i].descripcion`) y en un resumen enfocable;
  - tras guardar, "Cambios guardados. El catálogo público se actualiza en 5 minutos como máximo.";
  - un 401 lleva a `/ingresar` conservando lo escrito (borrador en el estado de navegación o `sessionStorage` envuelto en try/catch; sin datos personales) y al volver se restaura el formulario para reintentar;
  - un 403 muestra un aviso de permiso.

  Las pruebas cubren la normalización de la tasa, el 401 con el formulario restaurado y el 403. Sin estilos en línea
- [ ] T050 [US3] Agregar a `web/Aplicacion.tsx` las rutas `/admin/catalogo` y `/admin/catalogo/:codigo` con `<RutaProtegida roles={['ADMINISTRADOR']}>`, y la opción "Catálogo" en `web/componentes/Menu.tsx` solo para ADMINISTRADOR. Actualizar `web/componentes/Menu.test.tsx`

**Punto de control**: las historias 1, 2 y 3 funcionan, y cambiar una tasa no requiere tocar código (EQ-06).

---

## Fase 6: Historia de usuario 4 - Desactivar y reactivar una receta (Prioridad: P3)

**Objetivo**: una receta desactivada desaparece de la vista pública y del asistente, y se puede
reactivar.

**Prueba independiente**: con `PUT {"activa":false}` sobre `LIC-06`, deja de aparecer en la lista,
la ficha responde 404 y el asistente da `RECETA_NO_DISPONIBLE`; al reactivarla vuelve.

### Pruebas de la historia 4 ⚠️

- [ ] T051 [P] [US4] Prueba de integración `int/desactivar-receta.e2e-spec.ts`, que restaura `LIC-06` en `afterEach`:
  - **Desactivar**: `PUT LIC-06 {"activa":false}` como administrador → 200 con `activa=false`, y la fila de `cambio_receta` con `{"activa":{"antes":true,"despues":false}}`. Después:
    - la lista pública no incluye `LIC-06`;
    - `GET /catalogo/recetas/LIC-06` → 404;
    - `POST /asistente/proponer` con `OTRO/SI/MEDIO` → `NO_DETERMINADA / RECETA_NO_DISPONIBLE` (no `LIC-02`);
    - `GET /admin/catalogo/recetas/LIC-06` → 200 con `activa=false`.
  - **Reactivar**: `PUT {"activa":true}` → todo vuelve, y hay una segunda fila de registro.
  - **Caché**: los cambios se ven sin esperar al TTL, porque la caché se invalida al guardar.

### Implementación de la historia 4

- [ ] T052 [US4] En `web/paginas/admin/EditarReceta.tsx` agregar el interruptor "Activa", un `checkbox` con su etiqueta y la ayuda "Si la desactivas, no se mostrará al público ni la propondrá el asistente". En `web/paginas/admin/Catalogo.tsx`, distinguir las desactivadas con texto, no solo con color. Ampliar `EditarReceta.test.tsx` y `Catalogo.test.tsx`. Si T051 encuentra un hueco en la lógica de US1 a US3, corregirlo en su archivo y agregar la prueba que lo reproduce

**Punto de control**: las cuatro historias funcionan de forma independiente.

---

## Fase 7: Acabado y temas transversales

**Propósito**: escenarios de calidad, documentación y verificación final.

- [ ] T053 [P] Crear `tests/carga/eq01-catalogo.js` (k6, research §R-10):
  - variables `BASE`, `USUARIOS` y `DURACION`;
  - mezcla de peticiones: 50 % `GET /catalogo/recetas?tipo=LICENCIA`, 30 % `GET /catalogo/recetas/<código al azar de LIC-01 a LIC-09>` y 20 % `GET /asistente/preguntas` + `POST /asistente/proponer` con respuestas al azar;
  - `thresholds`: `http_req_duration: ['p(95)<2000']` y `http_req_failed: ['rate<0.01']`;
  - `check` del código 200;
  - un comentario con el comando `docker run … grafana/k6:<versión fijada> run -` del [quickstart](./quickstart.md).

  Ejecutarlo contra un stack aislado: primero con 100 usuarios durante 2 minutos (humo) y después **con 1,000 usuarios** (SC-004, EQ-01) durante al menos 2 minutos. Anotar el p95, la tasa de errores y los recursos de la máquina. Si los umbrales no se cumplen por falta de recursos de la máquina local (no del sistema), dejarlo documentado como "pendiente de medir en el entorno desplegado" en `README.md` (T054) y en la descripción del PR (T058); si fallan por el sistema, corregirlo antes de fusionar (constitución, principio VI)
- [ ] T054 Actualizar `README.md`:
  - **Sección del asistente de ruta y del catálogo**: qué hace el asistente, la ficha pública, cómo edita el administrador en `/admin/catalogo` y el tiempo máximo de propagación de 5 minutos (Redis 240 s + navegador 60 s), con la nota de que normalmente el cambio se ve en la siguiente consulta.
  - **Fila "Sin bitácora ni versionado del catálogo"** de la tabla "Cambios de alcance": reemplazarla por "Registro de cambios del catálogo sin historial visible ni versionado". El motivo dice: "Cada cambio de una receta queda registrado (quién, cuándo, valores antes y después) en la misma operación; no hay pantalla para consultar ese historial ni versiones del catálogo para volver atrás. Cada esquela guarda el monto con el que se generó."
  - **Fila "Bitácora y versionado del catálogo"** de "Mejoras para la Fase 2": reemplazarla por "Pantalla de historial y versionado del catálogo", con el motivo "El registro de cambios ya existe (funcionalidad 003); falta consultarlo desde el portal y poder volver a una versión anterior."
  - **Fila nueva en "Cambios de alcance"**: "Gana el último que guarda al editar una receta", con el motivo "Pocos administradores; el registro de cambios permite recuperar un valor sobrescrito (aclaración 5 de la 003)".
  - **Resultados**: la tabla Lighthouse de las pantallas de la 003 (T055) y los dos resultados de k6 de T053 (100 y 1,000 usuarios), con el p95, la tasa de errores y la máquina usada; si la corrida de 1,000 no fue concluyente por recursos locales, la nota "SC-004 pendiente de medir en el entorno desplegado".
- [ ] T055 Auditoría Lighthouse 12 en modo móvil, en un stack aislado y con el procedimiento de la 002 (cookie `refresh_personal` con `--extra-headers` para la pantalla de administración), sobre:
  - `/asistente`;
  - `/asistente?TIPO_ESTABLECIMIENTO=OTRO&ES_CESIONARIO=NO&NIVEL_RIESGO=MEDIO`, que muestra la propuesta;
  - `/licencias/LIC-03`;
  - `/admin/catalogo/LIC-02`.

  La meta es accesibilidad ≥ 90 y buenas prácticas ≥ 90 (SC-008). Corregir lo que falte y anotar los resultados para T054. Comprobar que ninguna página tiene desplazamiento horizontal a 360 px
- [ ] T056 Recorrer los escenarios 1 a 5 y 7 de [quickstart.md](./quickstart.md) en un clon con su propio nombre de proyecto de Compose y sus propios puertos, con un administrador de prueba ficticio, **sin tocar el stack principal ni su administrador**. Medir con el navegador SC-001 (asistente en 3 minutos o menos) y SC-007 (edición en 3 minutos o menos) y anotarlos en `README.md`. Al terminar, bajar ese stack con `-v` y borrar el clon
- [ ] T057 Cadena completa de CI en local: `npm run build`, `lint`, `formato`, `test:unit`, `test:integracion` (con `DATABASE_URL` hacia un PostgreSQL temporal en el puerto 5433 y un Redis aislado), `cobertura` (≥ 80 % de líneas y ramas por archivo en `catalogo/dominio` y `catalogo/aplicacion`), `regla-dependencia` y `contrato`. Además, `docker run --rm -v "${PWD}:/repo" zricethezav/gitleaks:latest detect --source /repo --no-banner` debe dar 0 hallazgos
- [ ] T058 Abrir el PR de `003-catalogo-asistente` hacia `main` (la descripción incluye el resultado de k6 de T053 y, si aplica, que SC-004 queda pendiente de medir en el entorno desplegado) y confirmar los 5 checks en verde. **Hacer push solo con la autorización explícita de la usuaria**

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (fase 1)**: no depende de nada.
- **Base (fase 2)**: depende de T001, porque el TTL validado lo usan las pruebas de caché. **Bloquea
  todas las historias.**
- **US1 (fase 3)**: depende de la fase 2.
- **US2 (fase 4)**: depende de la fase 2. T030 extrae `mapear-receta.ts`; si US1 ya existe, T024 pasa
  a usarlo.
- **US3 (fase 5)**: depende de la fase 2. No necesita US1 ni US2 para sus pruebas, pero T039 lee la
  ficha pública si ya existe y si no usa `obtener` directamente.
- **US4 (fase 6)**: depende de US3 para el PUT y del comportamiento de `ProponerLicencia` (US1) y de
  la ficha (US2) para sus comprobaciones.
- **Acabado (fase 7)**: depende de las historias que se entreguen.

### Dentro de cada historia

- Las pruebas se escriben primero y deben fallar.
- Orden: dominio → puertos → casos de uso → adaptadores → controlador → cliente del portal →
  páginas → rutas.
- `cat/catalogo.module.ts` y `web/Aplicacion.tsx` los tocan varias historias: esas tareas son
  secuenciales y no llevan [P].

### Oportunidades de paralelismo

- **Fase 1**: T002 y T003, en paralelo con T001.
- **Fase 2**: T005 en paralelo con T006 tras T004; T008, T009 y T010 en paralelo tras T007; T014,
  T015 y T017 en paralelo entre sí.
- **US1**: T018, T019 y T020 en paralelo; luego T021 y T025 en paralelo.
- **US2**: T028 y T029 en paralelo; T031 en paralelo con T030.
- **US3**: las pruebas T034 a T040 en paralelo; luego T041, T043 y T047 en paralelo.
- Con más de una persona, US1, US2 y US3 pueden avanzar a la vez después de la fase 2.

---

## Ejemplo de paralelismo: historia 3

```bash
# Pruebas, todas a la vez (archivos distintos):
Tarea: "T034 coherencia-ruta.spec.ts"
Tarea: "T035 aplicar-cambios.spec.ts"
Tarea: "T036 actualizar-receta.spec.ts"
Tarea: "T037 matriz-permisos-catalogo.e2e-spec.ts"
Tarea: "T038 catalogo-admin.e2e-spec.ts"
Tarea: "T039 cache-catalogo.e2e-spec.ts"
Tarea: "T040 guardado-concurrente-receta.e2e-spec.ts"

# Luego, piezas independientes:
Tarea: "T041 coherencia-ruta.ts"
Tarea: "T043 puertos de la unidad de trabajo, invalidador y reloj"
Tarea: "T047 funciones de administración en clienteApi.ts"
```

---

## Estrategia de implementación

### Primero el MVP (solo la historia 1)

1. Fase 1 y fase 2: contrato, migración `0004` y lectura completa.
2. Fase 3 (US1): el asistente.
3. **Parar y validar** con el escenario 1 del quickstart y las 30 combinaciones.

### Entrega incremental

1. Base lista → US1 (MVP: el ciudadano descubre su licencia).
2. US2 → ficha pública de cualquier licencia.
3. US3 → el administrador aplica cambios del TUPA sin programar (EQ-06).
4. US4 → desactivar y reactivar.
5. Fase 7 → k6, Lighthouse, README y PR.

---

## Notas

- Hacer commit después de cada tarea o grupo lógico, con commits convencionales (`feat`, `test`,
  `docs`, `chore`) en la rama `003-catalogo-asistente`. No hacer push sin autorización.
- No usar el administrador ni la base del stack principal para las pruebas: usar un PostgreSQL
  temporal (5433) o un stack aislado.
- Si una tarea se desvía del diseño, anotar la desviación junto a la tarea al marcarla `[X]`, como en
  la 002.
