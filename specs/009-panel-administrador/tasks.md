# Tareas: Panel del administrador, auditoría de seguridad y buzón de pruebas

**Entrada**: documentos de diseño en `specs/009-panel-administrador/`

**Requisitos previos**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Pruebas**: obligatorias (principio V de la constitución). Las unitarias corren en local; las de
integración, E2E y Postman corren en GitHub Actions (poca memoria local).

**Organización**: por historia de usuario. Orden de ejecución: US2 (auditoría) antes que US1 (panel),
porque el panel muestra eventos de la auditoría; después US3 (ficha) y US4 (buzón). Un commit al
terminar cada fase.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede ir en paralelo (archivos distintos, sin dependencias pendientes).
- **[Historia]**: US1 panel, US2 auditoría, US3 ficha, US4 buzón.

---

## Fase 1: Preparación (contrato primero y dependencias)

- [X] T001 Agregar `nodemailer` 10.4.0 a `dependencies` y `@types/nodemailer` 8.0.2 a
      `devDependencies` en `apps/api/package.json` (versiones exactas) y actualizar `package-lock.json`
      con `npm install`
- [X] T002 Editar `docs/06-contrato-api/openapi.yaml`: esquemas `AccionAuditoriaSeguridad` (21
      valores), `EventoAuditoriaSeguridad`, `PaginaAuditoriaSeguridad`, `PanelAdministrador`,
      `FichaUsuario`, problema `accion-sobre-si-mismo` (409) y las operaciones `GET /admin/panel`,
      `GET /admin/auditoria` (json y csv, `X-Auditoria-Truncada`), `GET /usuarios/{usuarioId}`,
      `POST /usuarios/{usuarioId}/cerrar-sesiones` y `POST /usuarios/{usuarioId}/desbloquear`, según
      `contracts/api-administrador.md` (nulos con `type: [<tipo>, 'null']` de OpenAPI 3.1); anotar en las operaciones de auth, usuarios, catálogo y
      feriados que registran o publican su evento
- [X] T003 Actualizar la matriz de permisos y la sección del administrador en
      `docs/06-contrato-api/README.md`; correr `npm run contrato` (sin errores nuevos) y
      `npm run generar` (`packages/contracts`)

**Punto de control**: contrato válido y tipos regenerados.

---

## Fase 2: Base (bloquea todas las historias)

- [ ] T004 Migración `apps/api/prisma/migrations/0012_auditoria_seguridad/migration.sql`: tabla
      `seguridad.auditoria` (columnas, CHECK de `accion` con las 21 acciones y de `resultado`
      `EXITO|RECHAZADO`, `origen_hmac char(64)`, `detalle jsonb NOT NULL DEFAULT '{}'`,
      `evento_origen_id bigint UNIQUE`), los 4 índices y la función/disparadores "solo agregar"
      (`BEFORE UPDATE OR DELETE` y `BEFORE TRUNCATE`), según `data-model.md` §1
- [ ] T005 Reflejar la tabla en `docs/05-modelo-de-datos/esquema.sql` y
      `docs/05-modelo-de-datos/modelo-entidad-relacion.md`, y el modelo `AuditoriaSeguridad` en
      `apps/api/prisma/schema.prisma` (mismo commit que T004)
- [ ] T006 [P] Dominio `apps/api/src/modulos/seguridad/dominio/accion-auditoria.ts`: lista cerrada de
      21 acciones, grupo de cada una, texto en español, `ACCIONES_INGRESO_FALLIDO` y `esAccion()`;
      prueba `apps/api/test/unit/modulos/seguridad/dominio/accion-auditoria.spec.ts`
- [ ] T007 [P] Dominio `apps/api/src/modulos/seguridad/dominio/evento-auditoria.ts`:
      `EventoAuditoria.crear()` valida acción, resultado, `objeto` (≤ 40, `[A-Z0-9_-]` o fecha
      `AAAA-MM-DD`), `origenHmac` (64 hex) y el `detalle` permitido por acción (`motivo`, `rol`,
      `roles`, `campos`, `sesiones`, `segundos`; cualquier otra clave → `ErrorDominio`); fábricas por
      acción; prueba `apps/api/test/unit/modulos/seguridad/dominio/evento-auditoria.spec.ts`
- [ ] T008 [P] Puerto `apps/api/src/modulos/seguridad/dominio/puertos/repositorio-auditoria.ts`
      (`registrar`, `registrarDeOrigen` idempotente, `buscar(filtro, pagina)`, `ultimoIngreso`,
      `contarIngresosFallidos(desde)`) y tipos de filtro y fila
- [ ] T009 Adaptador `apps/api/src/modulos/seguridad/infraestructura/repositorio-auditoria-postgres.ts`
      (inserción con `ON CONFLICT (evento_origen_id) DO NOTHING`, consulta con filtros, orden
      `ocurrido_en DESC, id DESC` y nombres por una sola consulta) y función `insertarEventos(tx, …)`
      reutilizable dentro de otras transacciones
- [ ] T010 Ampliar los puertos y adaptadores con la auditoría en la misma transacción (research
      §R-03): `RepositorioUsuarios.crear/guardar(…, auditoria?)` y `CambioUsuario` que puede devolver
      eventos en `dominio/puertos/repositorio-usuarios.ts` y `infraestructura/repositorio-usuarios-postgres.ts`;
      `RepositorioSesiones.crear/guardar/revocarTodasDelUsuario(…, auditoria?)` en
      `dominio/puertos/repositorio-sesiones.ts` y `infraestructura/repositorio-sesiones-postgres.ts`
- [ ] T011 Configuración en `apps/api/src/compartido/infraestructura/configuracion.ts`:
      `ENVIO_OTP` = `simulado|buzon|sms`, `ENVIO_AVISOS` = `simulado|buzon` (por defecto `simulado`),
      `SMTP_BUZON_URL` (por defecto `smtp://localhost:1025`); en producción rechazar `ENVIO_OTP=buzon`,
      `ENVIO_AVISOS=buzon` y `ENVIO_OTP=simulado`; pruebas en
      `apps/api/test/unit/compartido/infraestructura/configuracion.spec.ts`; `.env.example`
- [ ] T012 Registrar el repositorio de auditoría en `apps/api/src/modulos/seguridad/seguridad.module.ts`
      y ajustar las pruebas unitarias existentes de los casos de uso a las firmas nuevas

**Punto de control**: compila, pruebas unitarias en verde, regla de dependencia sin violaciones.

---

## Fase 3: Historia 2 - Auditoría de seguridad (P1)

**Objetivo**: las 21 acciones quedan registradas y el administrador las consulta con filtros y CSV.

**Prueba independiente**: hacer las acciones y encontrarlas en `GET /admin/auditoria`, filtradas y en
CSV.

### Registro de las acciones

- [ ] T013 [US2] Limitador: `ResultadoReserva.bloqueo` (`CUENTA` | `ORIGEN`) cuando no está permitido,
      en `dominio/puertos/limitador-intentos.ts` y `infraestructura/limitador-intentos-redis.ts`, con su
      prueba unitaria
- [ ] T014 [US2] Ingresos en `aplicacion/iniciar-sesion.ts`, `aplicacion/verificar-otp.ts`,
      `aplicacion/cerrar-sesion.ts` y `aplicacion/cambiar-clave.ts`: `INGRESO_CORRECTO` (con la sesión),
      `CLAVE_INCORRECTA` (motivo `CLAVE`, `CUENTA_INACTIVA`, `CORREO_NO_REGISTRADO`),
      `CODIGO_INCORRECTO`, `CUENTA_BLOQUEADA`/`ORIGEN_BLOQUEADO` (con `segundos`), `CIERRE_SESION` y
      `CLAVE_CAMBIADA`; `origen_hmac` = HMAC de la IP; si falla el registro de un intento fallido, se
      avisa sin datos y la respuesta no cambia; el controlador pasa la IP a `cerrar-sesion`; pruebas
      unitarias de cada caso
- [ ] T015 [US2] Gestión de usuarios en `aplicacion/crear-usuario.ts`, `aplicacion/actualizar-usuario.ts`,
      `aplicacion/reemplazar-roles.ts` y `aplicacion/asignar-clave-temporal.ts`: `USUARIO_CREADO`
      (`roles`), `USUARIO_EDITADO` (`campos`, sin valores), `USUARIO_DESACTIVADO`,
      `USUARIO_REACTIVADO`, `ROL_ASIGNADO`/`ROL_QUITADO` (uno por rol) y `CLAVE_TEMPORAL_ASIGNADA`, con
      el id del administrador (el controlador `presentacion/usuarios.controller.ts` lo pasa a actualizar
      y clave temporal); pruebas unitarias
- [ ] T016 [P] [US2] Catálogo publica `RecetaActualizada` / `RecetaDesactivada` / `RecetaReactivada`
      (`{ codigoReceta, usuarioId, en }`) en la transacción de
      `apps/api/src/modulos/catalogo/infraestructura/unidad-de-trabajo-catalogo-postgres.ts`
- [ ] T017 [P] [US2] Plazos publica `FeriadoRegistrado` / `FeriadoEliminado` (`{ fecha, usuarioId, en }`)
      en la misma sentencia (CTE) en
      `apps/api/src/modulos/plazos/infraestructura/repositorio-feriados-postgres.ts`; `eliminar` recibe
      el id de quien elimina (puerto, caso de uso `aplicacion/feriados.ts`, controlador y pruebas)
- [ ] T018 [US2] Consumo en seguridad: `aplicacion/registrar-evento-configuracion.ts` (caso de uso con
      prueba unitaria) e `infraestructura/manejadores-configuracion.ts` (esquemas zod de los 5 eventos,
      error con nombre propio si no tiene la forma), registrados en el `DespachadorEventos` desde
      `seguridad.module.ts`

### Consulta

- [ ] T019 [P] [US2] Dominio `dominio/csv-auditoria.ts` (columnas, BOM, `;`, CRLF, apóstrofo ante
      fórmulas, máximo 10,000) y `dominio/filtro-auditoria.ts` (fechas de Lima, por defecto 30 días,
      rango ≤ 366, `desde ≤ hasta`); pruebas unitarias
- [ ] T020 [US2] Caso de uso `aplicacion/consultar-auditoria.ts` (página y CSV con truncado, texto de la
      acción, "Sin sesión" o "Sistema") con prueba unitaria
- [ ] T021 [US2] Controlador `presentacion/administrador.controller.ts`: `GET /admin/auditoria` (zod,
      422 con mensajes, `formato=csv` con `Content-Disposition`, `X-Auditoria-Truncada` y
      `Cache-Control: no-store`), solo ADMINISTRADOR
- [ ] T022 [US2] Pruebas de integración `apps/api/test/integracion/auditoria-seguridad.e2e-spec.ts`:
      cada una de las 21 acciones aparece al ocurrir (incluido el intento con correo inexistente sin
      actor ni afectado ni correo), filtros, paginación estable, CSV con los mismos filtros, la tabla
      rechaza `UPDATE` y `DELETE`, el mismo evento de catálogo o feriado consumido dos veces deja una
      fila. Cada respuesta se valida con `test/apoyo/validarContrato.ts`. Como la auditoría no se
      puede borrar, cada prueba filtra por los ids que crea y compara diferencias, nunca totales
      globales
- [ ] T023 [P] [US2] Portal: `apps/web/src/paginas/admin/Auditoria.tsx` (filtros, tabla apilable a 360
      px, paginación, vacío, 422, descarga CSV con aviso de truncado) y su prueba
      `Auditoria.test.tsx`; funciones `obtenerAuditoriaSeguridad` y `descargarAuditoriaSeguridad` en
      `apps/web/src/servicios/clienteApi.ts`; ruta en `apps/web/src/Aplicacion.tsx` y "Auditoría" en
      `apps/web/src/componentes/Menu.tsx` (con su prueba)

**Punto de control**: auditoría completa; commit de la fase.

---

## Fase 4: Historia 1 - Panel del administrador (P1)

**Objetivo**: el administrador entra a su panel con las cifras de usuarios y seguridad.

**Prueba independiente**: ingresar como administrador y ver las cifras de los datos sembrados.

- [ ] T024 [P] [US1] Puerto `dominio/puertos/bloqueos-cuentas.ts` y adaptador
      `infraestructura/bloqueos-cuentas-redis.ts` (`SCAN` + `MGET` de `lim:fallos:correo:*` y
      `lim:fallos:ip:*`, umbral ≥ 5, `estadoDeCuenta` con el TTL, `desbloquear` con `DEL` solo de la
      clave del correo; `null` o `ErrorLimitadorNoDisponible` si Redis no responde)
- [ ] T025 [P] [US1] Puerto `dominio/puertos/consulta-panel.ts` y adaptador
      `infraestructura/consulta-panel-postgres.ts` (usuarios por estado, por rol vigente, sesiones
      abiertas, cuentas existentes entre los HMAC bloqueados)
- [ ] T026 [US1] Dominio `dominio/panel-administrador.ts`: inicio de "hoy" y de "7 días" en hora de
      Lima y armado de las cifras (con `bloqueos: null` si no hay dato); prueba unitaria
- [ ] T027 [US1] Caso de uso `aplicacion/obtener-panel.ts` (prueba unitaria con Redis caído) y
      `GET /admin/panel` en `presentacion/administrador.controller.ts`
- [ ] T028 [US1] Pruebas de integración `apps/api/test/integracion/administrador.e2e-spec.ts` (panel):
      cifras con datos sembrados, diferencias antes/después (la auditoría no se borra), una cuenta bloqueada cuenta 1 y un correo
      inexistente bloqueado no; con 10,000 eventos sembrados en una sentencia (`generate_series`), el
      panel y la primera página de la auditoría responden en < 2 s (SC-001); respuestas validadas con
      `validarContrato`
- [ ] T029 [P] [US1] Portal: `apps/web/src/paginas/admin/Panel.tsx` (tarjetas, "No disponible",
      últimos eventos, accesos directos, "Actualizar") y `Panel.test.tsx`; `obtenerPanel` en
      `clienteApi.ts`; ruta `/admin`, "Panel" en el menú; `Ingresar.tsx` y `CambiarClave.tsx` envían al
      administrador a `/admin` sin destino guardado (pruebas en `Ingresar.test.tsx` y
      `CambiarClave.test.tsx`)

**Punto de control**: panel funcional; commit de la fase.

---

## Fase 5: Historia 3 - Ficha del usuario con acciones rápidas (P1)

**Objetivo**: ficha con datos de seguridad y botones de cerrar sesiones y desbloquear.

**Prueba independiente**: cerrar las sesiones de un usuario y desbloquear una cuenta desde la ficha.

- [ ] T030 [P] [US3] Dominio `dominio/reglas-acciones-administrador.ts` (`ErrorAccionSobreSiMismo`
      para cerrar sesiones y desbloquear) con prueba unitaria; problema `accionSobreSiMismo()` (409) en
      `apps/api/src/compartido/presentacion/error-problema.ts`
- [ ] T031 [US3] Casos de uso `aplicacion/cerrar-sesiones-de-usuario.ts` (revoca en la base con
      `SESIONES_CERRADAS` en la misma transacción y marca en la caché) y
      `aplicacion/desbloquear-cuenta.ts` (borra el contador de la cuenta y registra
      `CUENTA_DESBLOQUEADA`; 503 si Redis no responde), con pruebas unitarias
- [ ] T032 [US3] Caso de uso `aplicacion/obtener-ficha-usuario.ts` (último ingreso, sesiones
      abiertas, bloqueo, historial de roles con nombres, últimos 10 eventos) con prueba unitaria
- [ ] T033 [US3] Controlador `presentacion/usuarios.controller.ts`: `GET /usuarios/:usuarioId` (404 si
      el id no es uuid), `POST …/cerrar-sesiones` (200 `{ sesionesCerradas }`) y `POST …/desbloquear`
      (204), con la traducción de errores 404/409/503
- [ ] T034 [US3] Integración en `administrador.e2e-spec.ts`: la sesión cerrada deja de servir en la
      siguiente petición y el usuario sigue activo; el desbloqueado puede volver a intentar; "no a sí
      mismo" → 409; ficha con historial de roles; respuestas validadas con `validarContrato`
- [ ] T035 [P] [US3] Integración `apps/api/test/integracion/matriz-permisos-009.e2e-spec.ts`: las 5
      operaciones nuevas, sin sesión 401 y con cada uno de los otros 5 roles 403, sin cambiar datos
- [ ] T036 [P] [US3] Integración `apps/api/test/integracion/privacidad-009.e2e-spec.ts`: ni correo,
      ni celular, ni clave, ni código, ni IP en `seguridad.auditoria`, en el CSV, en las respuestas de
      la auditoría ni en los registros capturados
- [ ] T037 [P] [US3] Portal: `apps/web/src/componentes/Confirmacion.tsx` (diálogo nativo, foco en
      Cancelar, Escape) con prueba; `apps/web/src/paginas/admin/FichaUsuario.tsx` y
      `FichaUsuario.test.tsx` (datos, botones con confirmación, ocultos en la ficha propia,
      "Desbloquear" deshabilitado si no hay dato, historial, últimos eventos); `obtenerFichaUsuario`,
      `cerrarSesionesDeUsuario` y `desbloquearUsuario` en `clienteApi.ts`; ruta `/admin/usuarios/:id`;
      enlace "Ver ficha" en `paginas/admin/Usuarios.tsx` (prueba en `Usuarios.test.tsx`)

**Punto de control**: ficha funcional; commit de la fase.

---

## Fase 6: Historia 4 - Buzón de pruebas en desarrollo (P2)

**Objetivo**: los códigos y avisos llegan a una página web en desarrollo.

**Prueba independiente**: pedir un código y verlo en el buzón.

- [ ] T038 [P] [US4] Dominio compartido `apps/api/src/compartido/dominio/destino-enmascarado.ts`
      (celular `9•••••123`, correo `ju•••@dominio`) con prueba unitaria
- [ ] T039 [US4] `apps/api/src/modulos/seguridad/infraestructura/enviador-otp-buzon.ts`: decora a
      `EnviadorOtpSimulado` (misma clave `dev:otp:*` y caducidad) y envía por SMTP con `nodemailer`
      (asunto con destino enmascarado y propósito; remitente y destinatario fijos); `ErrorEnvioOtp` si
      falla; elección del adaptador según `ENVIO_OTP` en `seguridad.module.ts`
- [ ] T040 [US4] `apps/api/src/modulos/notificaciones/infraestructura/enviador-buzon.ts`: decora a
      `EnviadorSimuladoRedis` y envía el aviso; elección según `ENVIO_AVISOS` en
      `notificaciones.module.ts`
- [ ] T041 [US4] Prueba de integración `apps/api/test/integracion/buzon.e2e-spec.ts` con un servidor
      SMTP mínimo en proceso (`node:net`): el adaptador entrega el mensaje con el destino enmascarado,
      deja el código en Redis y lanza `ErrorEnvioOtp` si el SMTP no responde
- [ ] T042 [US4] `infra/docker-compose.yml`: servicio `mailpit` (`axllent/mailpit:v1.21.8`, puerto
      `${PUERTO_BUZON:-8025}`), `ENVIO_OTP`/`ENVIO_AVISOS` por defecto `buzon` y `SMTP_BUZON_URL` en la
      API; `.github/workflows/e2e.yml` fija `ENVIO_OTP=simulado` y `ENVIO_AVISOS=simulado`; verificar que
      `infra/produccion/` no incluye Mailpit; `.env.example` con `PUERTO_BUZON`

**Punto de control**: buzón listo; commit de la fase.

---

## Fase 7: Pulido y documentación

- [ ] T043 [P] Postman: 3 peticiones 401 (`/admin/panel`, `/admin/auditoria`, `/usuarios/{id}`) en
      `tests/postman/humo.postman_collection.json` y colección completa regenerada con
      `npm run postman:generar`
- [ ] T044 [P] README principal: panel, auditoría, buzón (`http://localhost:8025`) y el recorrido por
      el enlace empezando por el administrador; `crear-administrador` como único paso de terminal
      además de encender el sistema
- [ ] T045 [P] Diagrama de casos de uso en `docs/` (ver panel, consultar auditoría de seguridad,
      cerrar sesiones, desbloquear cuenta) y nota de la mejora en `docs/08-sprint-2/README.md`
      (`node tests/analisis/verificar-citas.mjs` en verde)
- [ ] T046 Verificaciones finales en local: lint, typecheck, formato, contrato, regla de dependencia,
      cobertura de la API (≥ 80 % por archivo en dominio y aplicación), pruebas del portal, build y
      gitleaks

---

## Dependencias y orden

- Fase 1 → Fase 2 → Fases 3 a 6 → Fase 7.
- US2 antes que US1 (el panel usa la consulta de la auditoría). US3 usa el puerto de bloqueos de US1.
  US4 solo depende de la Fase 2 (configuración).
- Dentro de cada fase: dominio → aplicación → infraestructura y presentación → pruebas de integración
  → portal.

## Paralelismo

- Fase 2: T006, T007 y T008 en paralelo.
- Fase 3: T016, T017 y T019 en paralelo; T023 (portal) en paralelo con la API.
- Fase 5: T035, T036 y T037 en paralelo.

## Estrategia

- MVP: Fases 1 a 4 (auditoría y panel).
- Incremento: ficha (Fase 5) y buzón (Fase 6), luego documentación.
