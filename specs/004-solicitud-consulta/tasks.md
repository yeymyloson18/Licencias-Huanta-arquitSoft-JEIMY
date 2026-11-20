---
description: "Lista de tareas de la funcionalidad 004: Presentar solicitud y consultar el estado del trámite"
---

# Tareas: Presentar solicitud y consultar el estado del trámite

**Entrada**: documentos de diseño de `specs/004-solicitud-consulta/`

**Prerrequisitos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: incluidas. Las exigen la constitución (principio V) y la especificación (SC-002 a
SC-009; EQ-01, EQ-04 y EQ-05). En cada historia las pruebas se escriben primero y deben fallar antes
de implementar.

**Organización**: las tareas se agrupan por historia de usuario en el orden de la especificación:
US1 y US2 son P1, US3 es P2 y US4 es P3. Cada historia se puede probar sola: las pruebas de US2 y US4
siembran expedientes directamente en la base con el apoyo de la fase 2, sin depender del flujo de
US1. US3 reutiliza el caso de uso de presentación de US1.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[USn]**: historia de usuario de `spec.md` a la que pertenece la tarea.
- Las rutas son relativas a la raíz del repositorio. Se usan estas abreviaturas:
  - `tra/` = `apps/api/src/modulos/tramites/`
  - `seg/` = `apps/api/src/modulos/seguridad/`
  - `test-tra/` = `apps/api/test/unit/modulos/tramites/`
  - `test-seg/` = `apps/api/test/unit/modulos/seguridad/`
  - `int/` = `apps/api/test/integracion/`
  - `web/` = `apps/web/src/`

## Convenciones para todas las tareas

- TypeScript `strict`, sin `any`, y nombres del dominio en español (principio IV).
- `tra/dominio/` y `tra/aplicacion/` no importan paquetes npm ni módulos `node:*`. La transacción,
  el almacén, Redis, la huella SHA-256 y el reloj van detrás de puertos ([plan.md](./plan.md),
  estructura). El cableado se hace en `tra/tramites.module.ts` con `useFactory`.
- Desde `tramites` solo se importan `seg/fachada.ts` y `apps/api/src/modulos/catalogo/fachada.ts`
  (principio I). Nada de `tramites` importa archivos internos de otros módulos.
- Ningún registro, respuesta, mensaje de error, evento ni fila de auditoría incluye documento, RUC,
  celular, correo, dirección ni datos del representante (FR-035). Los registros identifican el
  expediente por su número.
- Toda respuesta HTTP de las pruebas de integración se valida con `esperarCumpleContrato`
  (`apps/api/test/apoyo/validarContrato.ts`). Las pruebas de integración se ejecutan con
  `npm run test:integracion` y una `DATABASE_URL` hacia un PostgreSQL temporal (puerto 5433) y un
  Redis aislado, nunca hacia el stack principal.
- Los 422 usan `ErrorValidacion` (`apps/api/src/compartido/presentacion/filtro-problema.ts`) con el
  `campo` de [contracts/](./contracts/); los 401/403 del personal los emiten los guards de la 002.
- Los datos de identidad de prueba son los ficticios de [quickstart.md](./quickstart.md).

---

## Fase 1: Preparación (configuración)

**Propósito**: dejar listo el almacén de archivos y los límites de tamaño antes de tocar el código.

- [X] T001 Agregar `ALMACEN_ARCHIVOS_RUTA` a `apps/api/src/compartido/infraestructura/configuracion.ts`
  (por defecto una carpeta del sistema operativo de archivos temporales + `licencias-archivos`; error
  que nombra la variable si no se puede crear o escribir), con sus casos en
  `apps/api/test/unit/compartido/configuracion.spec.ts`
  _Nota de implementación:_ la configuración solo exige una ruta absoluta (sin efectos de disco al cargarla); la comprobación de que se puede crear y escribir queda para el adaptador del almacén (T032).
- [X] T002 [P] En `infra/docker-compose.yml`, agregar el volumen `archivos-tramites` montado en la API
  **y en cualquier réplica** (`ALMACEN_ARCHIVOS_RUTA=/var/lib/licencias/archivos`) y documentar la
  variable en `.env.example` con el comentario "fuera de la carpeta pública del portal y compartido
  por todas las instancias de la API (research §R-08)"
  _Nota de implementación:_ además, `apps/api/Dockerfile` crea `/var/lib/licencias/archivos` con dueño `node` antes de `USER node`, porque el volumen con nombre copia ese dueño y la API no corre como root.
- [X] T003 [P] En `apps/web/nginx.conf`, `client_max_body_size 11m;` en `location /api/` (10 MB del
  archivo + encabezados del multipart, research §R-08)
- [X] T004 [P] Agregar `@types/multer` como dependencia de desarrollo de `apps/api` (`npm install -D
  -w apps/api @types/multer`); no agregar dependencias de ejecución

---

## Fase 2: Base (prerrequisitos bloqueantes)

**Propósito**: contrato, migración, cifrado compartido, fachadas y el esqueleto de `tramites`.

**⚠️ CRÍTICO**: ninguna historia puede empezar antes de terminar esta fase.

### Contrato y modelo de datos (principios II y III)

- [X] T005 Modificar `docs/06-contrato-api/openapi.yaml` exactamente según
  [contracts/openapi-cambios.md](./contracts/openapi-cambios.md): las 8 operaciones (respuestas,
  descripciones y `Cache-Control`), el parámetro `ClaveIdempotenciaObligatoria` en `POST
  /expedientes`, la descripción de `Expediente.direccion` ("solo para el personal con acceso al
  detalle: mesa de partes, evaluador y jefatura"), `NuevaSolicitud` (`identidadPresencial` → `identidad` obligatoria, `documentos`
  `maxItems: 30`, `additionalProperties: false`), `ExpedienteRegistrado` (nombreLicencia, canal,
  presentadoEn, siguientePaso), `EstadoPublico` (descripcionEstado, presentadoEn, historial;
  `tokenConsulta` opcional; `additionalProperties: false`) y `descargarDocumento` con 200 binario.
  `npm run contrato` sin advertencias
  _Nota de implementación:_ `redocly lint` queda con 6 advertencias, todas anteriores a la 004 (antes eran 7); ninguna nueva.
- [X] T006 [P] Actualizar `docs/06-contrato-api/README.md` con la matriz de permisos de
  [contracts/openapi-cambios.md](./contracts/openapi-cambios.md) y el nuevo conteo de operaciones
- [X] T007 Regenerar los tipos de `packages/contracts` y comprobar `npm run typecheck` en
  `apps/api` y `apps/web`
- [X] T008 Crear `apps/api/prisma/migrations/0006_solicitud_consulta/migration.sql` según
  [data-model.md §1](./data-model.md), con comentarios en español que citen FR y research:
  - `tramites.expediente`: `receta_al_presentar jsonb NOT NULL`, `verificacion_id uuid NULL` con
    índice único parcial `WHERE verificacion_id IS NOT NULL`, `con_representante boolean NOT NULL
    DEFAULT false` y las restricciones `CHECK (numero ~ '^EXP-[0-9]{4}-[0-9]{6}$')`, `CHECK ((canal =
    'EN_LINEA') = (verificacion_id IS NOT NULL))`, `CHECK ((canal = 'MESA_PARTES') = (registrado_por
    IS NOT NULL))` y `CHECK (con_representante = (representante_cifrado IS NOT NULL))`;
  - `tramites.documento_temporal` con `tamano_bytes BETWEEN 1 AND 10485760`, `tipo_mime IN
    ('application/pdf', 'image/jpeg', 'image/png')`, `clave_almacen UNIQUE`, `CHECK ((verificacion_id
    IS NULL) <> (usuario_id IS NULL))` e índice `(subido_en)`;
  - `tramites.documento.requisito_orden smallint NOT NULL`;
  - `tramites.clave_idempotencia` (`clave uuid PK`, `huella_cuerpo char(64) NOT NULL`,
    `expediente_id uuid NOT NULL REFERENCES tramites.expediente (id)`, `creada_en`);
  - `tramites.auditoria`: `accion` admite `PRESENTAR_EN_LINEA` y `VER_DETALLE`; `usuario_id NULL`
    con `CHECK (accion = 'PRESENTAR_EN_LINEA' OR usuario_id IS NOT NULL)`;
  - `seguridad.verificacion_identidad.representante_documento_hmac bytea NULL` con `CHECK
    (con_representante = (representante_documento_hmac IS NOT NULL))`.
  No tocar `0001` a `0005`
- [X] T009 [P] Actualizar `docs/05-modelo-de-datos/esquema.sql` con el estado después de `0006`
  (dentro de cada `CREATE TABLE`, sin `ALTER`) y `docs/05-modelo-de-datos/modelo-entidad-relacion.md`
  (entidades `DOCUMENTO_TEMPORAL` y `CLAVE_IDEMPOTENCIA`, columnas nuevas y diccionario de
  `tramites`)
- [X] T010 Aplicar las migraciones en un PostgreSQL temporal, regenerar `apps/api/prisma/schema.prisma`
  con `npx prisma db pull` conservando los nombres de modelo y `@@map` existentes, y `npx prisma
  generate`; comprobar `npm run typecheck` y que `int/esquema-equivalente.e2e-spec.ts` pasa

### Cifrado compartido (research §R-06)

- [X] T011 Mover `seg/dominio/puertos/protector-datos.ts` a
  `apps/api/src/compartido/dominio/protector-datos.ts` y
  `seg/infraestructura/protector-datos-aes-gcm.ts` a
  `apps/api/src/compartido/infraestructura/protector-datos-aes-gcm.ts` **sin cambiar** algoritmo,
  formato `iv ‖ tag ‖ texto` ni variables; proveerlo desde `compartido.module.ts` con un token
  `PROTECTOR_DATOS`; actualizar las importaciones de `seguridad` y de las pruebas
  (`test/apoyo/usuarios-prueba.ts`, `test/unit/modulos/seguridad/...`) y mover su spec a
  `apps/api/test/unit/compartido/protector-datos-aes-gcm.spec.ts`. Las pruebas de la 002 deben pasar
  sin otros cambios. Ajustar `.dependency-cruiser.cjs` solo si la regla de `compartido` lo exige
  _Nota de implementación:_ el token `PROTECTOR_DATOS` vive en `compartido/infraestructura/protector-datos-aes-gcm.ts` y no en `compartido/dominio/`: un archivo del dominio que solo se importa como tipo no se carga en las pruebas y rompía el umbral de cobertura por archivo. El dominio conserva solo la interfaz. Sin cambios en `.dependency-cruiser.cjs`.

### Fachadas y esqueleto de `tramites`

- [X] T012 [P] Agregar a `apps/api/src/modulos/catalogo/fachada.ts` `obtenerRecetaVigente(codigo):
  Promise<RecetaVigenteDto | null>`: devuelve la receta solo si existe, está `activa` y es de tipo
  `LICENCIA`, con `codigo`, `nombre`, `ruta`, `tasa`, `plazoDias`, `tipoPlazo`, `calificacion`,
  `ordenItse`, `plazoItseDias`, `vigenciaMeses` y `requisitos [{ id, orden, descripcion,
  obligatorio, condicion }]`; prueba en `apps/api/test/unit/modulos/catalogo/fachada.spec.ts` con el
  repositorio falso de la 003 (activa, desactivada, trámite conectado, inexistente)
  _Nota de implementación:_ el repositorio falso de la 003 deja los `id` de requisito en `null`; la prueba de la fachada les asigna `id` como lo haría la base.
- [X] T013 [P] Pruebas unitarias en `test-tra/dominio/numero-expediente.spec.ts`: `crear(2026, 1)` →
  `EXP-2026-000001`; `crear(2027, 154)` → `EXP-2027-000154` (no se reinicia, aclaración 4);
  `normalizar(' exp-2026-000001 ')` → `EXP-2026-000001`; rechaza `EXP-26-1`, `EXP-2026-0000001` y
  textos vacíos; correlativo > 999999 → error de dominio
- [X] T014 [P] Crear `tra/dominio/numero-expediente.ts` (`NumeroExpediente`, patrón
  `^EXP-[0-9]{4}-[0-9]{6}$`) y `tra/dominio/error-dominio.ts`. Deben pasar T013
- [X] T015 Crear el esqueleto del módulo: `tra/tramites.module.ts` (importado en `app.module.ts`),
  `tra/fachada.ts` vacía con su comentario de principio I, y los puertos de `tra/dominio/puertos/`:
  `reloj.ts`, `calculador-huella.ts` (`sha256(bytes)`) y `repositorio-expedientes.ts` (lecturas que
  completan las historias)
  _Nota de implementación:_ se crearon `reloj.ts` y `calculador-huella.ts`; `repositorio-expedientes.ts` se crea con su primera lectura en US2 (T044), para no dejar una interfaz vacía.
- [X] T016 [P] Crear el apoyo de pruebas `apps/api/test/apoyo/expedientes-prueba.ts`:
  `sembrarExpediente(prisma, protector, opciones)` inserta directamente un expediente válido (número,
  receta al presentar copiada del catálogo, titular ficticio cifrado con el protector de la
  aplicación, historial REGISTRADO) y `limpiarTramites(prisma)` borra `clave_idempotencia`,
  `documento`, `documento_temporal`, `historial_estado`, `auditoria`, `expediente` y los eventos
  `SolicitudPresentada`. Lo usan US2 y US4 para no depender de US1
  _Nota de implementación:_ se agregó la prueba `int/apoyo-expedientes.e2e-spec.ts`, que comprueba lo sembrado contra las restricciones de la `0006` (formato del número, canal, permiso de un solo uso).

**Punto de control**: contrato y migración aplicados, cifrado en `compartido`, `esquema-equivalente`
en verde y las pruebas de la 002 y la 003 siguen pasando.

---

## Fase 3: Historia de usuario 1 - Presentar la solicitud en línea con identidad confirmada (Prioridad: P1) 🎯 MVP

**Objetivo**: una persona confirma su identidad con el código, llena el formulario con solo los
requisitos de su licencia, sube los documentos y presenta; se crea un expediente REGISTRADO.

**Prueba independiente**: con el servicio simulado, confirmar la identidad del titular de prueba 1,
presentar `LIC-02` con sus documentos y comprobar el expediente REGISTRADO con ruta A, su historial,
auditoría y evento; el doble envío devuelve el mismo número.

### Pruebas de la historia 1 ⚠️

- [X] T017 [P] [US1] Pruebas unitarias en `test-seg/aplicacion/verificar-identidad-administrado.spec.ts`
  y `test-seg/aplicacion/verificar-otp-administrado.spec.ts` con dobles: `COINCIDE` crea la
  verificación (solo huellas) y envía el código; `NO_COINCIDE` no envía código y su error no nombra
  el dato; `NO_DISPONIBLE` → error de servicio no disponible; con representante, se comprueban las
  dos identidades (research §R-01); límite de intentos (5 por documento y 5 por origen, 3 envíos por
  celular) que falla cerrado; código correcto → token con `jti` = verificación; incorrecto o vencido
  → no autenticado
- [X] T018 [P] [US1] Prueba unitaria `test-seg/aplicacion/confirmar-identidad-en-linea.spec.ts`: token
  válido y la misma identidad (huellas de documento, RUC, celular y representante) → `{
  verificacionId }`; token vencido, de otra audiencia o con identidad distinta → rechazo
  _Nota de implementación:_ las pruebas de `ConfirmarIdentidadEnLinea` quedaron en `test-seg/aplicacion/verificar-otp-administrado.spec.ts`, junto a las del código (comparten los dobles de `dobles-identidad.ts`). Se agregó `identidad-comun.spec.ts` para el umbral de cobertura por archivo.
- [X] T019 [P] [US1] Prueba unitaria `test-tra/dominio/politica-requisitos.spec.ts`: lee las 9
  licencias de `docs/05-modelo-de-datos/datos-semilla.sql` (apoyo `semilla-catalogo.ts` de la 003) y,
  con y sin representante, comprueba `SIEMPRE` → obligatorio, `CON_REPRESENTANTE` → obligatorio con
  representante y "no aplica" sin él, `GIRO_ESPECIAL` y `SIN_PLANOS_VIGENTES` → opcional (aclaración
  3, SC-006); `faltantes` devuelve los obligatorios sin documento y rechaza documentos de requisitos
  que no aplican o no son de la receta
- [X] T020 [P] [US1] Pruebas unitarias en `test-tra/dominio/tipo-archivo.spec.ts` (firmas de PDF,
  JPEG y PNG; texto, ZIP, ejecutable y archivo vacío → no permitido) y
  `test-tra/dominio/expediente.spec.ts` (se crea solo REGISTRADO, ruta de la receta, primer registro
  del historial; establecimiento con giro ≤ 150, dirección ≤ 300, zona ≤ 60, área > 0; licencia de
  bodega (ruta C) con área > 50 m² → error en `areaM2`; receta no `LICENCIA` → error)
- [X] T021 [P] [US1] Pruebas unitarias en `test-tra/aplicacion/subir-documento.spec.ts` y
  `test-tra/aplicacion/presentar-solicitud.spec.ts` con dobles de la unidad de trabajo, el almacén,
  la huella, el reloj y las fachadas: tipo y tamaño; misma clave y cuerpo → mismo expediente; misma
  clave con otro cuerpo → error en `Idempotency-Key`; receta desactivada → error en `codigoReceta`;
  documento de otro solicitante o de más de 24 h → error en su requisito; faltantes → un error por
  requisito; permiso ya usado → conflicto; todo correcto → expediente, historial, auditoría
  `PRESENTAR_EN_LINEA`, evento `SolicitudPresentada` sin datos personales
- [X] T022 [P] [US1] Prueba de integración `int/identidad-administrado.e2e-spec.ts`: 200 `DesafioOtp`
  con celular enmascarado; 422 único para datos que no coinciden; 503 con el DNI `49999999`; código
  leído de Redis → 200 `TokenCorto` con `expiraEn = 900`; código incorrecto → 401; 6.º intento
  fallido → 429 con `Retry-After`; con Redis sin respuesta → 503 (falla cerrado); el token no sirve
  como token del personal; repetir la verificación da un desafío nuevo y el código del desafío
  anterior → 401; el 4.º envío al mismo celular en 15 min → 429; con representante, un documento del
  representante que no coincide → 422
- [X] T023 [P] [US1] Prueba de integración `int/documentos.e2e-spec.ts`: PDF, JPG y PNG reales → 201
  con `sha256` correcto; texto renombrado a `.pdf` → 415; 11 MB → 413; sin archivo → 422; sin token →
  401; sesión CAJA → 403; un `documentoId` subido con otra verificación no sirve al presentar
  (SC-008)
- [X] T024 [P] [US1] Prueba de integración `int/presentar-solicitud.e2e-spec.ts` (en línea): flujo
  completo de `LIC-02` → 201 con `EXP-AAAA-NNNNNN`, ruta A, REGISTRADO, `Location`; en la base:
  `receta_al_presentar` con la tasa vigente, datos personales cifrados, historial, auditoría y evento;
  sin un requisito obligatorio → 422 por requisito; con representante, la carta poder es obligatoria;
  identidad distinta de la confirmada → 403; permiso usado con otra clave → 409; permiso vencido →
  401; `expedienteOrigen` no nulo o `TRF-01` → 422; `vencePlazoEn = null` en la respuesta y en la
  base (FR-022) y ninguna fila en `pagos.esquela` (FR-019); la receta cambia mientras se llena el
  formulario: subir los documentos, agregar con el PUT de la 003 un requisito `SIEMPRE` a `LIC-02` y
  presentar → 422 en ese requisito nuevo, y después de restaurar la receta → 201 con la receta
  vigente en `receta_al_presentar`; atomicidad: un `CHECK` temporal que rechaza el historial deja sin
  expediente, documentos, auditoría, evento ni clave
- [X] T025 [P] [US1] Prueba de integración `int/idempotencia-expediente.e2e-spec.ts`: la misma clave y
  cuerpo enviada 10 veces en paralelo → un solo expediente y todas las respuestas con el mismo número
  (SC-007); misma clave con otro cuerpo → 422; `timeout` explícito de 60 000 ms
  _Nota de implementación:_ con 10 envíos simultáneos, los perdedores podían encontrar los documentos ya tomados por el ganador (422). `PresentarSolicitud` vuelve a leer la clave de idempotencia antes de rechazar por documentos y, si el ganador ya registró, responde el mismo expediente (200). Estable en 3 de 3 corridas.

### Implementación de la historia 1

- [X] T026 [US1] En `seguridad`: puerto `seg/dominio/puertos/servicio-identificacion.ts` (`verificar`
  → `COINCIDE | NO_COINCIDE | NO_DISPONIBLE`), adaptador
  `seg/infraestructura/servicio-identificacion-simulado.ts` con la tabla de
  [quickstart.md](./quickstart.md) y tiempo de espera de 3 s, y repositorio
  `seg/infraestructura/repositorio-verificaciones-postgres.ts` (guarda solo huellas,
  `resultado_servicio` `VALIDO`/`NO_VALIDO`/`NO_DISPONIBLE`)
  _Nota de implementación:_ la columna `seguridad.codigo_otp.proposito` era `varchar(20)` y `IDENTIDAD_ADMINISTRADO` tiene 22 caracteres (el CHECK de la 0001 ya lo admitía). Se agregó la migración `0007_codigo_otp_proposito` (`varchar(25)`, recreando el CHECK con el mismo nombre para que `esquema.sql` siga equivalente) y se actualizaron `esquema.sql` y `schema.prisma`; las migraciones 0001 a 0006 no se editaron.
- [X] T027 [US1] Ampliar `seg/dominio/puertos/limitador-intentos.ts` y
  `seg/infraestructura/limitador-intentos-redis.ts` con `reservarIntentoIdentidad(documentoHmac, ip)`,
  `liberarIntentoIdentidad`, `reservarEnvioIdentidad(celularHmac)` y `liberarEnvioIdentidad`, con el
  mismo algoritmo atómico y falla cerrado de la 002, y ampliar su spec
- [X] T028 [US1] Crear `seg/aplicacion/verificar-identidad-administrado.ts`,
  `verificar-otp-administrado.ts` y `confirmar-identidad-en-linea.ts`; ampliar el emisor de tokens
  (`seg/dominio/puertos/emisor-tokens.ts` y `seg/infraestructura/emisor-tokens-jwt.ts`) con
  `firmarIdentidad` / `verificarIdentidad` (audiencia `identidad-administrado`, 900 s, `jti` =
  verificación) sin que el guard del personal acepte ese token. Deben pasar T017 y T018
- [X] T029 [US1] Crear `seg/presentacion/identidad.controller.ts` (`POST identidad/verificar` y
  `identidad/verificar-otp`, zod con los patrones del contrato, `Cache-Control: no-store`) y exponer
  en `seg/fachada.ts` `confirmarIdentidadEnLinea(token, identidad)` y un guard
  `TokenIdentidadGuard` para los controladores de `tramites`. Debe pasar T022
- [X] T030 [P] [US1] Crear en `tra/dominio/` `politica-requisitos.ts` (`clasificarRequisitos`,
  `faltantes`), `tipo-archivo.ts` (`detectarTipoArchivo`), `receta-al-presentar.ts`,
  `establecimiento.ts` y `expediente.ts` (agregado y `RegistroHistorial`). Deben pasar T019 y T020
- [X] T031 [US1] Crear los puertos `tra/dominio/puertos/almacen-archivos.ts`,
  `unidad-de-trabajo-tramites.ts` y `repositorio-documentos-temporales.ts`, y los casos de uso
  `tra/aplicacion/subir-documento.ts` y `tra/aplicacion/presentar-solicitud.ts` (pasos de
  [contracts/identidad-y-solicitud.md](./contracts/identidad-y-solicitud.md)). Deben pasar T021
- [X] T032 [US1] Crear en `tra/infraestructura/`: `almacen-archivos-disco.ts` (nombres UUID dentro de
  `ALMACEN_ARCHIVOS_RUTA`, nunca el nombre original), `huella-sha256.ts`,
  `repositorio-documentos-temporales-postgres.ts` y `unidad-de-trabajo-tramites-postgres.ts`
  (`prisma.$transaction`: idempotencia, `nextval('tramites.numero_expediente_seq')`, expediente con
  datos cifrados con `PROTECTOR_DATOS`, documentos, historial, auditoría, `comun.evento_pendiente` y
  clave; unicidad de `verificacion_id` → conflicto; unicidad de la clave en paralelo → relee y
  devuelve el expediente existente)
- [X] T033 [US1] Crear `tra/presentacion/documentos.controller.ts` (`POST documentos`, Multer en
  memoria con `limits.fileSize = 10485760` → 413) y `tra/presentacion/expedientes.controller.ts`
  (`POST expedientes` en línea con `TokenIdentidadGuard`, `Idempotency-Key` obligatoria, zod
  `.strict()` de `NuevaSolicitud`, 201 con `Location` o 200 en el reintento, `Cache-Control:
  no-store`); cablear en `tra/tramites.module.ts`. Deben pasar T023, T024 y T025
  _Nota de implementación:_ `CatalogoModule` pasó a ser `@Global()` (como Seguridad): importarlo desde `tramites.module.ts` violaba la regla `aislamiento-entre-modulos`. Trámites inyecta solo `FachadaCatalogo` y `FachadaSeguridad`. El canal MESA_PARTES de `POST /expedientes` y de `POST /documentos` queda para la historia 3.
- [X] T034 [P] [US1] Agregar a `web/servicios/clienteApi.ts` `verificarIdentidad`,
  `verificarCodigoIdentidad`, `subirDocumento` (multipart, con el token de identidad o la sesión),
  `presentarSolicitud` (con `Idempotency-Key`) y sus tipos del contrato; resultados como
  `ResultadoOperacion` de la 002, distinguiendo 401, 409, 413, 415, 429 y 503
  _Nota de implementación:_ las funciones del trámite usan un cliente sin el middleware de sesión del personal, para que el token de identidad nunca se mezcle con el del personal ni dispare la renovación de sesión. `subirDocumento` acepta por ahora solo el token de identidad (la sesión de MESA_PARTES llega con la historia 3).
- [X] T035 [US1] Crear `web/tramite/ContextoTramite.tsx` (token, identidad, vencimiento y borrador del
  formulario solo en memoria, sin `localStorage` ni `sessionStorage`), montado **por encima de las
  rutas** en `web/Aplicacion.tsx` para que lo escrito sobreviva a la ida y vuelta por `/ingresar`, y
  la prueba `web/tramite/ContextoTramite.test.tsx`
- [X] T036 [US1] Prueba `web/paginas/tramite/Identidad.test.tsx` y página
  `web/paginas/tramite/Identidad.tsx` según [contracts/portal-tramite.md](./contracts/portal-tramite.md):
  dos pasos, casilla de representante, código con `autocomplete="one-time-code"`, mensajes de 422,
  429 (con la hora) y 503 (mesa de partes), foco en el título de cada paso; "Enviar otro código"
  reenvía los datos en memoria sin pedirlos de nuevo y muestra el 429 con la hora; sin `licencia`
  válida, muestra el selector de licencias activas
- [X] T037 [US1] Prueba `web/paginas/tramite/Solicitud.test.tsx` y componente compartido
  `web/componentes/FormularioSolicitud.tsx` + página `web/paginas/tramite/Solicitud.tsx`: requisitos
  en el orden de la receta (de `GET /catalogo/recetas/{codigo}`), carta poder solo con
  representante, opcionales con su explicación, subida por documento con su estado y reemplazo,
  errores junto a cada campo y resumen enfocable, bodega > 50 m² marcada en el campo, "Presentar"
  desactivado mientras envía, misma `Idempotency-Key` en los reintentos, 401/409 → vuelve a la
  identidad conservando lo escrito en memoria
  _Nota de implementación:_ `pruebas/api-simulada.ts` ahora acepta cuerpos que no son JSON (multipart). La página `Solicitud` marca su propia salida para que, al descartar el permiso (401/409), no redirija a la identidad sin el aviso antes de que termine su navegación.
- [X] T038 [US1] Prueba `web/paginas/tramite/Comprobante.test.tsx` y página
  `web/paginas/tramite/Comprobante.tsx`: número, licencia, ruta, estado, fecha y "Qué sigue"; botón
  "Imprimir" y estilos `@media print` en `web/estilos/global.css` sin estilos en línea
  _Nota de implementación:_ el comprobante recibe los datos en el estado de la navegación (memoria) y borra el trámite del contexto al montarse; al recargar conserva solo el número de la URL y un texto general.
- [X] T039 [US1] Agregar las rutas `/tramite/identidad`, `/tramite/solicitud` y
  `/tramite/comprobante/:numero` en `web/Aplicacion.tsx` y el botón "Presentar solicitud" en
  `web/componentes/FichaLicencia.tsx` (lleva a `/tramite/identidad?licencia=<código>`); actualizar
  `FichaLicencia.test.tsx`, `Licencia.test.tsx` y `Asistente.test.tsx`

**Punto de control**: la historia 1 funciona sola: se presenta en línea de punta a punta.

---

## Fase 4: Historia de usuario 2 - Consultar el estado del trámite sin cuenta (Prioridad: P1)

**Objetivo**: con número y DNI/CE/RUC, la persona ve el estado en lenguaje sencillo y su historial;
datos que no coinciden dan el mismo mensaje y 5 fallos por origen bloquean.

**Prueba independiente**: con un expediente sembrado (T016), consultar con DNI y con RUC; un DNI
ajeno y un número inexistente dan el mismo 404; el 6.º fallo da 429.

### Pruebas de la historia 2 ⚠️

- [X] T040 [P] [US2] Prueba unitaria `test-tra/dominio/estado-publico.spec.ts`: todos los valores de
  `EstadoExpediente` tienen descripción y siguiente paso en `TEXTO_ESTADO_PUBLICO`; `REGISTRADO` dice
  "Tu solicitud fue registrada y espera evaluación"
  _Nota de implementación:_ la prueba y la tabla `TEXTO_ESTADO_PUBLICO` ya se habían creado en la fase 3 (las usa el dominio del expediente); aquí solo se verificó que pasa.
- [X] T041 [P] [US2] Prueba unitaria `test-tra/aplicacion/consultar-estado.spec.ts` con dobles:
  normaliza el número; busca por huella del documento o del RUC; no encontrado → reserva un fallo; un
  acierto no suma; limitador bloqueado → bloqueo con segundos de espera; limitador caído → falla
  cerrado; el resultado no tiene datos personales
- [X] T042 [P] [US2] Prueba de integración `int/consulta-estado.e2e-spec.ts`: con DNI y con RUC → 200
  `EstadoPublico` sin documento, RUC, celular, correo ni dirección y con `Cache-Control: no-store`;
  número en minúsculas con espacios → 200; DNI ajeno y número inexistente → 404 con cuerpo idéntico;
  formato inválido → 422; 5 fallos desde el mismo origen → el 6.º, aunque correcto, 429 con
  `Retry-After` (SC-004, aclaración 1); fallos sobre el mismo número desde otro origen no bloquean al
  primero; Redis sin respuesta → 503

### Implementación de la historia 2

- [X] T043 [P] [US2] Crear `tra/dominio/estado-publico.ts` (`TEXTO_ESTADO_PUBLICO`). Debe pasar T040
- [X] T044 [US2] Crear el puerto `tra/dominio/puertos/limitador-consultas.ts`, el caso de uso
  `tra/aplicacion/consultar-estado.ts` y su lectura en `repositorio-expedientes.ts`; adaptadores
  `tra/infraestructura/limitador-consultas-redis.ts` (script Lua atómico, 5 fallos por origen en 15
  min, falla cerrado) y `tra/infraestructura/repositorio-expedientes-postgres.ts` (búsqueda por
  `numero` y `documento_hmac` o `ruc_hmac`). Deben pasar T041
  _Nota de implementación:_ el limitador reserva el intento antes de buscar y lo libera si la consulta acierta (mismo esquema de la 002), así dos fallos simultáneos no pasan el límite. El adaptador de PostgreSQL recibe el documento en claro y calcula su huella con el protector compartido; la base nunca ve el documento.
- [X] T045 [US2] Crear `tra/presentacion/consulta.controller.ts` (`POST expedientes/consultar`, zod con
  los patrones del contrato, origen desde `req.ip` con el `trust proxy` de la 002, 404 único, 429 con
  `Retry-After`, `Cache-Control: no-store`) y cablearlo. Debe pasar T042
  _Nota de implementación:_ `ConsultaController` se declara antes que `ExpedientesController` en el módulo; el 503 usa `ErrorProblema.intentosNoDisponibles()` y el 404 el mismo `noEncontrado()` en los dos casos.
- [X] T046 [P] [US2] Agregar `consultarEstado(numero, documento)` a `web/servicios/clienteApi.ts`
  (resultados `ok`, `no-encontrado`, `bloqueado` con la hora, `no-disponible`)
- [X] T047 [US2] Prueba `web/paginas/Consulta.test.tsx` y página `web/paginas/Consulta.tsx` según
  [contracts/portal-tramite.md](./contracts/portal-tramite.md): formulario POST (nada en la URL),
  resultado con estado, descripción, siguiente paso e historial en lista ordenada, mensaje único para
  datos que no coinciden, 429 con la hora; ruta `/consulta` en `web/Aplicacion.tsx` y enlace "Consultar
  mi trámite" en `web/paginas/Inicio.tsx` (actualizar `Inicio.test.tsx`)
  _Nota de implementación:_ los dos botones de la cabecera del inicio quedan juntos en `.cabecera__acciones`. La prueba usa `MemoryRouter`, así que la ausencia de datos en la URL se comprueba por el cuerpo del POST.

**Punto de control**: las historias 1 y 2 funcionan, cada una por su lado.

---

## Fase 5: Historia de usuario 3 - Registrar una solicitud presencial en mesa de partes (Prioridad: P2)

**Objetivo**: el personal de mesa de partes registra con el mismo formulario y validaciones, sin
código al celular; el expediente queda con canal `MESA_PARTES` y quién lo registró.

**Prueba independiente**: con un usuario MESA_PARTES de prueba, registrar al titular extranjero de
prueba y comprobar canal, `registrado_por` y auditoría `REGISTRAR_PRESENCIAL`; CAJA recibe 403.

### Pruebas de la historia 3 ⚠️

- [X] T048 [P] [US3] Prueba unitaria `test-seg/aplicacion/verificar-identidad-presencial.spec.ts`:
  `COINCIDE` → válida sin enviar código; `NO_COINCIDE` → error sin nombrar el dato; `NO_DISPONIBLE` →
  servicio no disponible; con representante, las dos identidades
- [X] T049 [P] [US3] Ampliar `test-tra/aplicacion/presentar-solicitud.spec.ts` con el canal presencial:
  identidad comprobada por la fachada presencial, `registradoPor` = usuario, auditoría
  `REGISTRAR_PRESENCIAL`, historial con el usuario y el comentario "Registrada en mesa de partes"
  _Nota de implementación:_ la auditoría `REGISTRAR_PRESENCIAL` la escribe el adaptador de PostgreSQL según el canal; la prueba unitaria comprueba canal, `registradoPor` e historial, y la de integración (T050) comprueba la fila de auditoría. El doble `UnidadDeTrabajoFalsa` ya no trata `verificacionId = null` como permiso repetido.
- [X] T050 [P] [US3] Prueba de integración `int/mesa-partes.e2e-spec.ts` con `clienteConRoles`:
  MESA_PARTES sube documentos y registra → 201 con `canal = MESA_PARTES`; en la base `registrado_por`
  y la auditoría; falta un documento → 422 como en línea; identidad que no coincide → 422; servicio
  caído (`49999999`) → 503; documentos subidos por otro usuario no sirven; con CAJA, INSPECTOR,
  EVALUADOR, JEFATURA y ADMINISTRADOR → 403 sin crear nada; sin sesión → 401

### Implementación de la historia 3

- [X] T051 [US3] Crear `seg/aplicacion/verificar-identidad-presencial.ts` y exponer
  `verificarIdentidadPresencial(identidad)` en `seg/fachada.ts`. Debe pasar T048
  _Nota de implementación:_ además se creó `seg/presentacion/solicitante.guard.ts` (`SolicitanteGuard` y `@SolicitanteActual()`, exportados por la fachada): acepta el token de identidad o una sesión con rol MESA_PARTES (otro rol → 403, sin nada → 401). `@RequiereRoles` no sirve aquí porque cualquiera de sus dos guards rechaza el token del otro canal.
- [X] T052 [US3] Ampliar `tra/aplicacion/presentar-solicitud.ts` y `tra/presentacion/expedientes.controller.ts`
  con el canal presencial: `POST expedientes` y `POST documentos` aceptan también la sesión con
  `@RequiereRoles('MESA_PARTES')` y `@UsuarioActual()` (otro rol → 403); identidad por la fachada
  presencial. Deben pasar T049 y T050
  _Nota de implementación:_ en mesa de partes, una identidad que no coincide responde 422 con `campo = identidad` (mismo mensaje para cualquier dato) y el servicio caído 503 `identificacion-no-disponible`. Se actualizó `int/presentar-solicitud.e2e-spec.ts` (fase 3): un token del personal sin MESA_PARTES ahora responde 403, como dice el contrato, y no 401.
- [X] T053 [US3] Prueba `web/paginas/personal/MesaPartes.test.tsx` y página
  `web/paginas/personal/MesaPartes.tsx`: elegir la licencia, identidad del titular (con fecha de
  emisión y representante, sin código) y el mismo `FormularioSolicitud`; al terminar muestra el
  comprobante para imprimir; sesión vencida → conserva lo escrito en memoria y pide ingresar (como la
  003); ruta `/personal/mesa-partes/nueva` con `<RutaProtegida roles={['MESA_PARTES']}>` en
  `web/Aplicacion.tsx` y opción "Registrar solicitud" en `web/componentes/Menu.tsx` solo para
  MESA_PARTES (actualizar `Menu.test.tsx`)
  _Nota de implementación:_ los campos de identidad se movieron a `web/componentes/CamposIdentidad.tsx` y los usan la identidad en línea y mesa de partes. Lo escrito vive en `web/tramite/ContextoMesaPartes.tsx` (memoria, por encima de las rutas; tiene datos personales, por eso no usa `sessionStorage` como el borrador del catálogo de la 003). `Ingresar` ahora permite volver a `/personal/...`. El comprobante reutiliza la página `/tramite/comprobante/:numero`.

**Punto de control**: las historias 1, 2 y 3 funcionan; el trámite presencial sigue el mismo camino.

---

## Fase 6: Historia de usuario 4 - Ver la bandeja de expedientes del personal (Prioridad: P3)

**Objetivo**: mesa de partes, evaluador y jefatura ven todos los expedientes con filtros, abren el
detalle y descargan los documentos.

**Prueba independiente**: con expedientes sembrados (T016), entrar como EVALUADOR, filtrar
REGISTRADO + ruta B, abrir uno y descargar un documento; CAJA recibe 403.

### Pruebas de la historia 4 ⚠️

- [X] T054 [P] [US4] Pruebas unitarias en `test-tra/aplicacion/listar-expedientes.spec.ts`,
  `obtener-detalle-expediente.spec.ts` y `descargar-documento.spec.ts`: filtros combinados, orden y
  paginación (`porPagina` 1 a 50); el detalle enmascara el documento (`4*****21`) y registra
  `VER_DETALLE`; documento de otro expediente → no encontrado
  _Nota de implementación:_ las pruebas de los tres casos de uso quedaron en un solo archivo, `test-tra/aplicacion/bandeja-expedientes.spec.ts` (comparten el repositorio en memoria), e incluyen `enmascararDocumento`.
- [X] T055 [P] [US4] Prueba de integración `int/bandeja-expedientes.e2e-spec.ts`: con 5 expedientes
  sembrados, EVALUADOR filtra `estado=REGISTRADO&ruta=B` → solo los que cumplen, del más reciente al
  más antiguo, con `Cache-Control: no-store`; `asignadosAMi=true` o `vencenAntesDe` → 422; detalle →
  200 `Expediente` con la dirección para los tres roles (la consulta pública no la muestra) y una fila
  `VER_DETALLE`; descarga → 200 con `Content-Disposition: attachment`,
  `X-Content-Type-Options: nosniff` y el mismo SHA-256 del archivo subido; documento de otro
  expediente → 404
- [X] T056 [P] [US4] Prueba de integración `int/matriz-permisos-tramites.e2e-spec.ts`: para
  `listarExpedientes`, `obtenerExpediente` y `descargarDocumento` → sin sesión 401; INSPECTOR, CAJA y
  ADMINISTRADOR 403; MESA_PARTES, EVALUADOR y JEFATURA 200. Para `subirDocumento` y
  `presentarSolicitud` → sin token 401; roles distintos de MESA_PARTES 403. Ningún 401/403 cambia
  datos (SC-003)

### Implementación de la historia 4

- [X] T057 [US4] Crear `tra/aplicacion/listar-expedientes.ts`, `obtener-detalle-expediente.ts` y
  `descargar-documento.ts` con sus lecturas en `repositorio-expedientes-postgres.ts` (índice
  `ix_expediente_estado`; descifra la dirección y enmascara el documento) y la auditoría
  `VER_DETALLE` en la misma operación. Deben pasar T054
  _Nota de implementación:_ los tres casos de uso viven en `tra/aplicacion/bandeja-expedientes.ts`; el enmascarado es una función del dominio (`dominio/enmascarar-documento.ts`). Cada caso de uso depende solo del método del repositorio que usa (`Pick<RepositorioExpedientes, …>`), también `ConsultarEstado`. `obtenerDetalle` lee y registra `VER_DETALLE` en una sola transacción; un número inexistente no registra nada.
- [X] T058 [US4] Agregar a `tra/presentacion/expedientes.controller.ts` `GET expedientes`, `GET
  expedientes/:numeroExpediente` y `GET expedientes/:numeroExpediente/documentos/:documentoId` con
  `@RequiereRoles('MESA_PARTES', 'EVALUADOR', 'JEFATURA')`, zod para los filtros, `Cache-Control:
  no-store` y la descarga con `StreamableFile`. Deben pasar T055 y T056
  _Nota de implementación:_ los tres GET están en un controlador propio, `tra/presentacion/bandeja.controller.ts` (misma ruta `expedientes`), para no mezclar la presentación de solicitudes con la lectura del personal. Un número con formato inválido o un id de documento que no es UUID responden 404. El `Content-Disposition` lleva un nombre ASCII de respaldo y el nombre real en `filename*` (RFC 6266). Las filas incluyen `nombreLicencia` (el esquema `ExpedienteResumen` lo admite).
- [X] T059 [P] [US4] Agregar `listarExpedientes`, `obtenerExpediente` y la URL de descarga a
  `web/servicios/clienteApi.ts`
  _Nota de implementación:_ además de `urlDocumento`, se agregó `descargarDocumentoExpediente`: el token del personal vive en memoria, así que un enlace directo no lleva la sesión; la página descarga el archivo con `fetch` y lo guarda con su nombre.
- [X] T060 [US4] Pruebas y páginas `web/paginas/personal/Expedientes.tsx` (tarjetas en el celular,
  tabla en pantallas anchas, filtros en la URL, paginación) y `web/paginas/personal/DetalleExpediente.tsx`
  (datos, historial y documentos con descarga), con sus `.test.tsx`; rutas con `<RutaProtegida
  roles={['MESA_PARTES', 'EVALUADOR', 'JEFATURA']}>` en `web/Aplicacion.tsx` y opción "Expedientes"
  en `web/componentes/Menu.tsx` para esos roles (actualizar `Menu.test.tsx`)
  _Nota de implementación:_ los filtros usan un grupo `role="search"` con un botón, no un `<form>`: react-router navega dentro de una transición y React 19 intenta armar un `FormData` del envío, lo que falla en jsdom. Las tarjetas y la tabla se muestran según el ancho con CSS (`@media (min-width: 48rem)`).

**Punto de control**: las cuatro historias funcionan de forma independiente.

---

## Fase 7: Acabado y temas transversales

**Propósito**: privacidad, tareas programadas, escenarios de calidad, documentación y verificación
final.

- [ ] T061 [P] Prueba de integración `int/privacidad-tramites.e2e-spec.ts` con el logger capturador de
  la 002: recorre identidad, subida, presentación (en línea y presencial), consulta correcta y
  fallida, bandeja y detalle, y comprueba que ningún registro, URL, error, evento ni fila de auditoría
  contiene los documentos, RUC, celulares, correos ni direcciones de los datos de prueba (SC-005)
- [ ] T062 Crear `tra/aplicacion/descartar-documentos-vencidos.ts` y
  `tra/infraestructura/tarea-descarte-documentos.ts` (cada hora, `setInterval` con `unref()`, solo si
  obtiene `pg_try_advisory_lock`; borra filas y archivos de más de 24 h y registra solo cuántos
  borró), con prueba unitaria del caso de uso y de integración que siembra un documento de 25 h y
  otro de 1 h (research §R-09)
- [ ] T063 [P] Crear `tests/carga/eq01-consulta.js` (k6, mismas variables y umbrales que
  `eq01-catalogo.js`: `p(95)<2000` y `rate<0.01`) que consulta expedientes sembrados con datos
  correctos, repartidos entre varios orígenes para no chocar con el límite; ejecutarlo en un stack
  aislado con 100 y con 1,000 usuarios y anotar p95, errores y la máquina (EQ-01, SC-002)
- [ ] T064 Auditoría Lighthouse 12 móvil, en un stack aislado, sobre `/tramite/identidad`,
  `/tramite/solicitud?licencia=LIC-02` (con permiso), `/tramite/comprobante/<número>` y `/consulta`:
  accesibilidad ≥ 90 y buenas prácticas ≥ 90 (SC-009); sin desplazamiento horizontal a 360 px en
  todas las pantallas nuevas, incluidas las del personal. Escaneo base de OWASP ZAP sobre las
  pantallas nuevas sin alertas altas ni medias. La comprobación de TLS 1.3 con testssl.sh (EQ-04)
  queda anotada en el README como pendiente para el entorno desplegado, porque en local no hay TLS
- [ ] T065 Recorrer los escenarios 1 a 7 de [quickstart.md](./quickstart.md) en un clon con su propio
  nombre de proyecto y puertos, con usuarios ficticios y **sin tocar el stack principal ni su
  administrador**; medir SC-001 (≤ 15 min) y SC-010 (≤ 10 min) en el navegador. Además, levantar 2
  réplicas de la API (`--scale api=2`), subir los documentos y presentar varias veces seguidas
  (el balanceador reparte las peticiones) y comprobar que el expediente se crea (constitución: API
  sin estado, research §R-08). Al terminar, bajar el stack con `-v` y borrar el clon
- [ ] T066 Actualizar `README.md` (sección de la funcionalidad 004: presentar, consultar, mesa de
  partes, bandeja, datos ficticios del servicio simulado y resultados de k6, Lighthouse, ZAP y
  tiempos), ADR-007 en `docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md`
  (`tokenIdentidad` de un solo uso y con audiencia propia) y
  `docs/03-diseno-de-software/diagrama-casos-de-uso.md` (CU03, CU04, CU06 y CU12 a "✅ Hecho")
- [ ] T067 Cadena completa de CI en local: `npm run build`, `lint`, `formato`, `test:unit`,
  `test:integracion` (PostgreSQL temporal en 5433 y Redis aislado), `cobertura` (≥ 80 % de líneas y
  ramas por archivo en `tramites/dominio`, `tramites/aplicacion`, `seguridad/dominio` y
  `seguridad/aplicacion`), `regla-dependencia` y `contrato`; `gitleaks` con 0 hallazgos
- [ ] T068 Preparar la descripción del PR de `004-solicitud-consulta` hacia `main` (resultados de k6,
  Lighthouse, ZAP y tiempos; SC-002 pendiente de confirmar en el entorno desplegado si aplica) y
  confirmar los 5 checks en verde. **Hacer push y abrir o actualizar el PR solo con la autorización
  explícita de la usuaria**

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (fase 1)**: no depende de nada.
- **Base (fase 2)**: depende de T001 (configuración del almacén). **Bloquea todas las historias.**
- **US1 (fase 3)**: depende de la fase 2.
- **US2 (fase 4)**: depende de la fase 2; sus pruebas usan expedientes sembrados (T016), no US1.
- **US3 (fase 5)**: depende de US1 (amplía `PresentarSolicitud`, el controlador y
  `FormularioSolicitud`).
- **US4 (fase 6)**: depende de la fase 2; sus pruebas usan expedientes sembrados. La descarga de un
  documento real se prueba mejor si US1 ya existe; si no, T055 siembra el documento directamente.
- **Acabado (fase 7)**: depende de las historias que se entreguen; T061 recorre las cuatro.

### Dentro de cada historia

- Las pruebas se escriben primero y deben fallar.
- Orden: dominio → puertos → casos de uso → adaptadores → controlador → cliente del portal →
  páginas → rutas.
- `tra/tramites.module.ts`, `tra/presentacion/expedientes.controller.ts`, `seg/fachada.ts`,
  `web/Aplicacion.tsx`, `web/componentes/Menu.tsx` y `web/servicios/clienteApi.ts` los tocan varias
  historias: esas tareas son secuenciales entre historias.

### Oportunidades de paralelismo

- **Fase 1**: T002, T003 y T004 en paralelo con T001.
- **Fase 2**: T006 en paralelo con T007 tras T005; T009 en paralelo con T008; T012, T013/T014 y T016
  en paralelo entre sí tras T010 y T011.
- **US1**: las pruebas T017 a T025 en paralelo; luego T030 y T034 en paralelo con T026 a T029.
- **US2**: T040, T041 y T042 en paralelo; T043 y T046 en paralelo.
- **US4**: T054, T055 y T056 en paralelo; T059 en paralelo con T057.
- Con más de una persona, US1, US2 y US4 pueden avanzar a la vez después de la fase 2; US3 espera a
  US1.

---

## Ejemplo de paralelismo: historia 1

```bash
# Pruebas, todas a la vez (archivos distintos):
Tarea: "T017 verificar-identidad-administrado.spec.ts y verificar-otp-administrado.spec.ts"
Tarea: "T018 confirmar-identidad-en-linea.spec.ts"
Tarea: "T019 politica-requisitos.spec.ts"
Tarea: "T020 tipo-archivo.spec.ts y expediente.spec.ts"
Tarea: "T021 subir-documento.spec.ts y presentar-solicitud.spec.ts"
Tarea: "T022 identidad-administrado.e2e-spec.ts"
Tarea: "T023 documentos.e2e-spec.ts"
Tarea: "T024 presentar-solicitud.e2e-spec.ts"
Tarea: "T025 idempotencia-expediente.e2e-spec.ts"

# Luego, piezas independientes:
Tarea: "T030 dominio de tramites"
Tarea: "T034 funciones del trámite en clienteApi.ts"
```

---

## Estrategia de implementación

### Primero el MVP (solo la historia 1)

1. Fase 1 y fase 2: configuración, contrato, migración `0006`, cifrado compartido y fachadas.
2. Fase 3 (US1): identidad y presentación en línea.
3. **Parar y validar** con los escenarios 1 y 2 del quickstart.

### Entrega incremental

1. Base lista → US1 (MVP: el ciudadano presenta en línea).
2. US2 → consulta pública del estado.
3. US3 → registro presencial en mesa de partes.
4. US4 → bandeja y detalle del personal.
5. Fase 7 → privacidad, descarte, k6, Lighthouse, ZAP, README y PR.

---

## Notas

- Hacer commit después de cada tarea o grupo lógico, con commits convencionales (`feat`, `test`,
  `docs`, `chore`) en la rama `004-solicitud-consulta`. No hacer push sin autorización.
- No usar el administrador ni la base del stack principal para las pruebas: usar un PostgreSQL
  temporal (5433) o un stack aislado.
- Si una tarea se desvía del diseño, anotar la desviación junto a la tarea al marcarla `[X]`, como en
  la 003.
