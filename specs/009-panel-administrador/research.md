# Investigación: Panel del administrador, auditoría de seguridad y buzón de pruebas (009)

## R-01. Dónde y cómo se guarda la auditoría de seguridad

- **Decisión**: tabla `seguridad.auditoria` en el esquema del módulo `seguridad`, creada por la
  migración `0012_auditoria_seguridad`. Solo de agregar: un disparador `BEFORE UPDATE OR DELETE`
  lanza un error, y otro `BEFORE TRUNCATE` también. La aplicación no tiene ninguna operación de
  edición ni de borrado.
- **Por qué**: el usuario de la base de la aplicación es dueño de las tablas, así que `REVOKE` no lo
  limita; el disparador sí, incluso ante un error de programación (FR-012).
- **Alternativas**: reusar los registros de la aplicación (no se pueden filtrar ni exportar, y se
  rotan); una tabla en `comun` (rompe "un esquema por módulo").

## R-02. Cómo llegan los eventos de catálogo y feriados

- **Decisión**: catálogo y plazos **publican** eventos en `comun.evento_pendiente` dentro de la misma
  transacción de su cambio (`RecetaActualizada`, `RecetaDesactivada`, `RecetaReactivada`,
  `FeriadoRegistrado`, `FeriadoEliminado`). `seguridad` registra un manejador por tipo en el
  `DespachadorEventos` y escribe en `seguridad.auditoria` con `evento_origen_id` único:
  `INSERT … ON CONFLICT (evento_origen_id) DO NOTHING`. Entrega "al menos una vez" → aparece una sola
  vez (FR-009).
- **Por qué**: es el patrón de la 005 y la 006 (outbox). Ningún módulo importa a otro ni toca un
  esquema ajeno: `comun` es la cola compartida. La auditoría queda en una sola tabla, así que la lista
  paginada, los filtros y el CSV son una sola consulta ordenada.
- **Alternativa descartada**: que la vista lea `catalogo.cambio_receta` y `plazos.feriado` por las
  fachadas y mezcle en memoria. Paginar tres fuentes ordenadas en memoria es costoso y frágil; los
  feriados eliminados ya no existen y se perdería el evento.
- **Feriados**: `registrar` pasa a una sentencia con CTE (`WITH ins AS (INSERT … ON CONFLICT DO
  NOTHING RETURNING …) INSERT INTO comun.evento_pendiente … SELECT … FROM ins`), atómica sin abrir
  una transacción interactiva. `eliminar` usa el mismo patrón con `DELETE … RETURNING` y recibe ahora
  el id de quien elimina.
- **Catálogo**: la unidad de trabajo inserta el evento después de `cambio_receta`. El tipo depende de
  la diferencia de `activa`: `false` → desactivada, `true` → reactivada, sin cambio → actualizada.
- **Retraso**: el despachador corre cada pocos segundos; la auditoría de configuración puede tardar
  ese tiempo en verse. Se documenta.

## R-03. Auditoría en la misma transacción que el cambio

- **Decisión**: los métodos de escritura de los repositorios de `seguridad` reciben una lista
  opcional de eventos y los insertan en su transacción:
  - `RepositorioUsuarios.crear(usuario, auditoria?)`, `guardar(usuario, auditoria?)`;
  - `modificar(usuarioId, cambio)`: el `cambio` puede devolver los eventos, que se insertan antes del
    `COMMIT`; si la regla de "último administrador" lanza, no se guarda nada;
  - `RepositorioSesiones.crear(sesion, auditoria?)`, `guardar(sesion, auditoria?)` y
    `revocarTodasDelUsuario(usuarioId, ahora, auditoria?)`.
  Los intentos fallidos, que no cambian datos, se registran con `RepositorioAuditoria.registrar`.
- **Por qué**: la constitución pide "auditoría de cada operación importante en la misma transacción"
  (VII). Una unidad de trabajo genérica sería más invasiva para casos de uso ya probados.
- **Errores**: si la auditoría de un intento fallido no se puede guardar, se registra una advertencia
  sin datos y el ingreso responde igual (no se convierte un 401 en 500). En un cambio, la falla
  revierte todo.

## R-04. Actor, afectado y origen de cada acción

| Acción | Actor | Afectado | Objeto | Resultado |
| --- | --- | --- | --- | --- |
| `INGRESO_CORRECTO` | la persona | la persona | — | `EXITO` |
| `CLAVE_INCORRECTA` | — | la cuenta si existe | — | `RECHAZADO` (`detalle.motivo`) |
| `CODIGO_INCORRECTO` | — | la cuenta del desafío si existe | — | `RECHAZADO` |
| `CUENTA_BLOQUEADA` | — | la cuenta si existe | — | `RECHAZADO` |
| `ORIGEN_BLOQUEADO` | — | la cuenta si existe | — | `RECHAZADO` |
| `CIERRE_SESION` | la persona | la persona | — | `EXITO` |
| `CLAVE_CAMBIADA` | la persona | la persona | — | `EXITO` |
| Gestión de usuarios | el administrador | el usuario | — | `EXITO` |
| Configuración | quien guardó | — | código o fecha | `EXITO` |

- **Origen**: `origen_hmac` = HMAC-SHA256 de la IP con la clave de datos, en hexadecimal, solo en los
  eventos de ingreso. Agrupa intentos sin revelar la dirección (FR-013).
- **Bloqueo por cuenta u origen**: `ResultadoReserva` suma `bloqueo: 'CUENTA' | 'ORIGEN'` cuando no
  está permitido (`CUENTA` si el contador del correo pasó el límite).
- **Correo inexistente o mal formado**: actor y afectado nulos, sin correo (FR-014).
- **`USUARIO_EDITADO`**: `detalle.campos` con los nombres de los campos cambiados
  (`nombreCompleto`, `celular`), nunca sus valores. Activar o desactivar produce su propia acción.
- **`ROL_ASIGNADO` / `ROL_QUITADO`**: un evento por rol, con `detalle.rol`.
- **`SESIONES_CERRADAS`**: `detalle.sesiones` = cantidad.

## R-05. Bloqueos: lectura y desbloqueo por un puerto

- **Decisión**: puerto `BloqueosCuentas` del dominio de `seguridad`:
  - `cuentasBloqueadas(): Promise<{ hmacs: string[]; origenes: number } | null>`: recorre
    `lim:fallos:correo:*` y `lim:fallos:ip:*` con `SCAN` (nunca `KEYS`) y lee los contadores con
    `MGET`; cuenta los que llegan al límite (≥ 5). `null` si Redis no responde.
  - `estadoDeCuenta(correoHmacHex): Promise<{ bloqueada: boolean; hasta: Date | null } | null>`.
  - `desbloquear(correoHmacHex): Promise<void>`: `DEL lim:fallos:correo:<hmac>`; lanza
    `ErrorLimitadorNoDisponible` si Redis no responde.
- **Contar cuentas, no correos**: el caso de uso cruza los HMAC bloqueados con los usuarios
  existentes (`correo_hmac = ANY(...)`), así los intentos con correos inexistentes no cuentan como
  "cuentas".
- **Por qué**: el contador ya está identificado por el HMAC del correo (002); `seguridad.usuario`
  guarda el mismo HMAC. Nunca se lee ni se expone un correo.

## R-06. Cifras del panel

- **Usuarios activos/inactivos y por rol**: `COUNT` sobre `seguridad.usuario` y `usuario_rol`
  vigente.
- **Sesiones abiertas**: `revocada_en IS NULL AND vence_maximo_en > now() AND ultima_actividad_en >
  now() - 30 min` (FR-003 y FR-003a de la 002).
- **Ingresos fallidos**: acciones `CLAVE_INCORRECTA`, `CODIGO_INCORRECTO`, `CUENTA_BLOQUEADA` y
  `ORIGEN_BLOQUEADO`. "Hoy" desde las 00:00 de Lima (UTC−5, sin horario de verano) y "7 días" desde
  las 00:00 de Lima de hace 6 días.
- **Últimos 10 eventos**: la misma consulta de la lista con `porPagina=10`.
- El cálculo de los límites de "hoy" y "7 días" y el armado de la respuesta están en el dominio
  (`panel-administrador.ts`), sin base ni reloj.

## R-07. Buzón de pruebas y dependencia SMTP

- **Decisión**: Mailpit (`axllent/mailpit:v1.21.8`) en `infra/docker-compose.yml`, SMTP en 1025 e
  interfaz web en 8025 (`PUERTO_BUZON`). Adaptadores con `nodemailer` 6.9.16.
- **Por qué `nodemailer`**: es la biblioteca SMTP de referencia en Node.js, sin dependencias de
  ejecución, con tipos mantenidos y licencia MIT-0. Servirá para el correo real del Sprint 3 cambiando
  solo la configuración. Escribir SMTP a mano con `node:net` sería más código propio sin pruebas de
  terreno; la API HTTP de Mailpit ataría el adaptador a Mailpit.
- **Adaptadores**:
  - `EnviadorOtpBuzon` (seguridad) **decora** a `EnviadorOtpSimulado`: primero deja el código en
    Redis (`dev:otp:*`, misma clave y caducidad) y después envía el correo al buzón. Si falla
    cualquiera de los dos, lanza `ErrorEnvioOtp` (el cupo se devuelve, como hoy).
  - `EnviadorBuzon` (notificaciones) decora a `EnviadorSimuladoRedis` igual.
  - Asunto: `Código de ingreso para 9•••••123` o `Aviso de su trámite para ju•••@correo.pe`. El destino
    se enmascara con una función pura de `compartido/dominio`.
  - Remitente fijo `buzon@licencias.local`; destinatario fijo `pruebas@licencias.local` (el destino
    real nunca va en una cabecera SMTP).
- **Configuración**: `ENVIO_OTP` = `simulado | buzon | sms` (por defecto `simulado`), `ENVIO_AVISOS`
  = `simulado | buzon` (por defecto `simulado`), `SMTP_BUZON_URL` (por defecto
  `smtp://localhost:1025`). En producción se rechazan `ENVIO_OTP=buzon`, `ENVIO_AVISOS=buzon` y
  `ENVIO_OTP=simulado` (este último ya existía). El compose de desarrollo fija `buzon` en los dos.
- **E2E**: `e2e.yml` fija `ENVIO_OTP=simulado` y `ENVIO_AVISOS=simulado` (aclaración). Postman y
  carga siguen con el compose por defecto (`buzon`), que también deja el código en Redis.
- **Alternativas**: MailHog (sin mantenimiento desde 2020); un endpoint propio para ver códigos (sería
  una superficie de ataque en la API).

## R-08. Consulta de la auditoría y CSV

- **Filtros**: `desde` y `hasta` (fechas de Lima, por defecto los últimos 30 días; rango máximo 366
  días; `desde > hasta` → 422), `accion` (una de las 21), `actorId` y `afectadoId` (uuid). Solo ids en
  la URL: ningún dato personal (VII).
- **Orden**: `ocurrido_en DESC, id DESC` (estable aunque dos eventos tengan la misma hora).
- **Paginación**: `pagina` y `porPagina` (1 a 100, por defecto 20), con `total`.
- **CSV**: `formato=csv`, mismas columnas que la pantalla (`fecha;accion;actor;afectado;objeto;
  resultado`), con el formato de la 007 (BOM, `;`, CRLF y apóstrofo ante fórmulas). Máximo 10,000
  filas; `X-Auditoria-Truncada: true|false`. `Content-Disposition: attachment;
  filename="auditoria-seguridad-<AAAA-MM-DD>.csv"`. `Cache-Control: no-store`.
- **Nombres**: se resuelven con una sola consulta a `seguridad.usuario` por los ids de la página. Un
  actor nulo se muestra "Sin sesión" en los ingresos y "Sistema" en el resto.
- **Reutilizar el CSV de la 007**: `reportes/dominio/csv.ts` vive en otro módulo; se copia la función
  `celdaCsv` a `seguridad/dominio/csv-auditoria.ts` (10 líneas) en lugar de importarla o moverla a
  `compartido` (moverla tocaría reportes sin necesidad).

## R-09. Reglas "no a sí mismo" y permisos

- `ReglasAccionesAdministrador.verificar(accion, administradorId, usuarioId)`: lanza
  `ErrorAccionSobreSiMismo` para `CERRAR_SESIONES` y `DESBLOQUEAR` cuando los ids coinciden → 409
  `accion-sobre-si-mismo` en el contrato.
- La regla "nunca sin administrador activo" ya existe (`ReglaUltimoAdministrador`) y no cambia.
- Todos los endpoints nuevos llevan `@RequiereRoles('ADMINISTRADOR')`. La matriz 401/403 se prueba con
  los 5 roles restantes.

## R-10. Portal

- El administrador entra a `/admin` cuando no hay un destino guardado: `Ingresar` y `CambiarClave`
  eligen `/admin` si la sesión tiene el rol ADMINISTRADOR; si no, `/` como hoy.
- **Confirmación**: componente `Confirmacion` con `<dialog>` nativo (`showModal`), foco en "Cancelar",
  `Escape` cancela; sin dependencias nuevas.
- **"No disponible"**: si `bloqueos` viene `null`, la tarjeta muestra "No disponible" y el botón
  "Desbloquear" queda deshabilitado con su motivo.
- **Filtros de usuario en la auditoría**: un `<select>` con la lista de usuarios (`GET /usuarios`,
  hasta 100), que envía el id. No hay campo de texto libre que pueda llevar un correo a la URL.
- **Descarga CSV**: con `fetch` y el token, como el reporte de la 007.
