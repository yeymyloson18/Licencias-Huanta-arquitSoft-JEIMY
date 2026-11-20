# Investigación y decisiones: Evaluación del expediente, esquela de pago y pago en caja

Entrada: [spec.md](./spec.md) (con las aclaraciones del 2026-11-20) y la sección "Cómo construirlo" de
`docs/sdd/005-evaluacion-pago.md`. La constitución prevalece sobre la entrada.

## R-01. La esquela se genera con un evento, no con una transacción compartida

- **Decisión**: al confirmar el riesgo, `tramites` cambia el expediente a PENDIENTE_PAGO y escribe el
  evento `EsquelaSolicitada` en `comun.evento_pendiente` **en la misma transacción**. `pagos` consume
  el evento y crea la esquela con `INSERT … ON CONFLICT (numero_expediente) DO NOTHING`. El evento
  lleva solo datos no personales: número de expediente, código y nombre de la licencia y monto.
- **Por qué**: la entrada pide decidir "a favor de la constitución". Una transacción compartida haría
  que el código de `tramites` abriera la transacción en la que escribe `pagos` (o al revés), y
  acoplaría los dos módulos a la misma conexión (principio I, EQ-06). El evento mantiene cada módulo
  dueño de sus tablas (principio III) y es la vía que la constitución nombra ("reaccionar a sus
  eventos"). Como el estado y el evento se guardan juntos, nunca hay un expediente PENDIENTE_PAGO sin
  esquela solicitada.
- **Consecuencia**: la esquela aparece en segundos (FR-005, SC-004). Mientras tanto,
  `GET /esquelas/{codigo}/pdf` responde 202 (ya previsto en el contrato) y la consulta pública muestra
  el monto que lleva el evento.
- **Alternativas**: fachada de `pagos` dentro de la transacción de `tramites` (descartada por lo
  anterior); generar la esquela al pedir el PDF (dejaría expedientes sin esquela que caja no encuentra).

## R-02. Despachador de eventos en `compartido`

- **Decisión**: `compartido/infraestructura/despachador-eventos.ts` lee `comun.evento_pendiente` cada
  2 segundos (`setInterval` con `unref()`) y entrega cada evento al manejador registrado para su
  `tipo`. Cada módulo registra sus manejadores al arrancar (`pagos`: `EsquelaSolicitada`; `tramites`:
  `PagoRegistrado`). Los tipos sin manejador (`SolicitudPresentada`, `EstadoExpedienteCambiado`) se
  quedan pendientes para la 006.
  - Una pasada: transacción con `pg_try_advisory_xact_lock` (una réplica a la vez, como el descarte de
    la 004); `SELECT … WHERE procesado_en IS NULL AND tipo = ANY($tipos) ORDER BY id LIMIT 50 FOR
    UPDATE SKIP LOCKED`, solo los que ya pueden reintentarse (`reintentar_en IS NULL OR reintentar_en <=
    now()`). Tras un error, `reintentar_en = now() + 2 s × 2^intentos`, con un máximo de 5 minutos
    (columna nueva de la migración 0008).
  - Éxito → `procesado_en = now()`. Error → `intentos + 1` y `ultimo_error` con el **nombre** del error
    (nunca el mensaje, que podría traer datos). **No hay límite de intentos** (FR-025: "se reintenta
    hasta lograrlo"); cada 10 fallos del mismo evento queda un aviso en el registro con su id y su tipo,
    para que alguien lo revise.
  - Entrega **al menos una vez**: cada manejador es idempotente (R-01 y R-06), así que procesar dos
    veces el mismo evento no cambia nada.
- **Por qué**: lo pide la entrada (advisory lock, `SKIP LOCKED`, reintentos) y sirve a los dos
  consumidores sin que un módulo conozca al otro.
- **Alternativas**: un consumidor por módulo con su propia tabla (dos colas para lo mismo); Redis
  Streams (otra pieza que operar y el estado ya vive en PostgreSQL, ADR-005).

## R-03. Máquina de estados en el dominio de `tramites`

- **Decisión**: `tramites/dominio/maquina-estados.ts` con una tabla de transiciones por acción y ruta:

  | Acción               | Desde           | Hacia                               | Ruta    |
  | -------------------- | --------------- | ----------------------------------- | ------- |
  | iniciar evaluación   | REGISTRADO      | EN_EVALUACION                       | A, B, C |
  | confirmar riesgo     | EN_EVALUACION   | PENDIENTE_PAGO (o PAGADO si tasa 0) | A, B, C |
  | observar             | EN_EVALUACION   | OBSERVADO (una sola vez)            | A, B, C |
  | subsanar             | OBSERVADO       | EN_EVALUACION                       | A, B, C |
  | denegar              | EN_EVALUACION   | DENEGADO                            | A, B, C |
  | registrar pago       | PENDIENTE_PAGO  | PAGADO                              | A, B, C |
  | aprobar              | PAGADO          | APROBADO                            | A, C    |

  Una acción fuera de la tabla lanza `ErrorTransicionInvalida(estadoActual, accion)` → 409 con el
  estado en el mensaje (FR-010).
- **Por qué**: las reglas del TUPA viven en el dominio y se prueban sin base (principios I y V).

## R-04. Corregir el riesgo dentro del mismo grupo

- **Decisión**: el cuerpo de `POST /expedientes/{n}/riesgo` cambia de `nivelRiesgo` a
  `codigoReceta` (opcional; si falta, se confirma la licencia actual). El grupo sale del catálogo:
  bodega (ruta C), corporativa (`es_corporativa`), cesionario (`es_cesionario`) o establecimiento (el
  resto). La fachada de `catalogo` agrega `obtenerRecetaParaEvaluacion(codigo)`: código, nombre,
  ruta, tasa, nivel de riesgo y grupo, solo si la receta es LICENCIA y está activa.
- Al confirmar se guardan `nivel_riesgo_propuesto` (el de la licencia presentada) y
  `nivel_riesgo_confirmado`; si cambia la licencia, se actualizan `codigo_receta` y `ruta`, y
  `receta_al_presentar` se conserva como estaba (es la copia de lo presentado).
- **Por qué**: con `nivelRiesgo` no se distingue "cesionario riesgo alto" de "establecimiento riesgo
  alto", y la corporativa no tiene nivel. Un código de receta es inequívoco (contrato primero: el
  cambio va al contrato antes del código).

## R-05. Concurrencia en las decisiones

- **Decisión**: cada decisión es un `UPDATE … WHERE numero = $1 AND estado = $esperado AND version =
  $ifMatch` que incrementa `version`. Cero filas → se relee: si cambió el estado, 409; si solo cambió
  la versión, 412. La cabecera `If-Match` ya es obligatoria en el contrato para riesgo, aprobar,
  observar y denegar (y se agrega a iniciar evaluación). Con dos confirmaciones simultáneas, solo una
  cambia el estado y escribe `EsquelaSolicitada`; la otra recibe 409 o 412 (SC-003).
- **Por qué**: la base decide, no una lectura previa.

## R-06. Pago atómico en `pagos`

- **Decisión**: en una transacción, `UPDATE pagos.esquela SET numero_recibo, pagada_en, registrado_por
  WHERE codigo = $1 AND numero_recibo IS NULL`, la fila `REGISTRAR_PAGO` de `pagos.auditoria` y el
  evento `PagoRegistrado`. Cero filas → 409 "esta esquela ya fue pagada" (o 404 si no existe). El
  índice único `ux_esquela_recibo` convierte un recibo repetido en 409. Antes de la transacción, la
  fachada de `tramites` confirma que el expediente está PENDIENTE_PAGO (FR-024); un expediente
  PENDIENTE_PAGO solo sale de ese estado con el pago, así que no hay carrera.
- `tramites` consume `PagoRegistrado` con `UPDATE … WHERE estado = 'PENDIENTE_PAGO'`, historial y
  `EstadoExpedienteCambiado`; si el expediente ya está PAGADO, no hace nada (idempotente).
- La cabecera opcional `Idempotency-Key` del contrato se acepta pero no se guarda: un reintento del
  mismo pago recibe 409 "ya fue pagada", que es el mensaje correcto para la cajera.

## R-07. PDF de la esquela con `pdf-lib`

- **Decisión**: agregar **una** dependencia de ejecución, `pdf-lib` (MIT, JavaScript puro, sin
  binarios nativos ni dependencias de sistema; solo usa `pako` y `tslib`). El PDF usa la fuente
  estándar Helvetica (codificación WinAnsi, que incluye á, é, í, ó, ú, ñ y "S/"). El documento lleva
  título, número de expediente, concepto, monto, código, fecha de emisión e instrucciones de pago; no
  lleva ningún dato del titular.
- **Por qué**: no hay ninguna librería de PDF instalada. `pdfkit` necesita `fontkit` y más
  dependencias; `pdfmake` incluye fuentes grandes; armar un PDF a mano es frágil. `pdf-lib` es la
  opción más ligera y conocida.

## R-08. `tokenConsulta` para descargar la esquela sin cuenta

- **Decisión**: `seguridad` firma un `tokenConsulta`: JWT de 15 minutos con audiencia propia
  (`consulta-expediente`) y el número de expediente como `sub`. La consulta pública lo devuelve solo
  cuando el expediente está PENDIENTE_PAGO, junto con `codigoEsquela`, `montoEsquela` y
  `esquelaPagada` (campos que `EstadoPublico` ya declara). `GET /esquelas/{codigo}/pdf` acepta ese
  token (solo para la esquela de ese expediente) o una sesión EVALUADOR, CAJA o JEFATURA, mediante un
  guard nuevo de la fachada de seguridad (`ConsultaOPersonalGuard`).
- **Por qué**: el contrato ya prevé el esquema `tokenConsulta`; un token de solo lectura y de un solo
  expediente evita reenviar el documento del titular en cada descarga.

## R-09. Subsanación

- **Decisión**: `POST /expedientes/{n}/subsanar` acepta el `tokenIdentidad` de la 004 o la sesión de
  MESA_PARTES (el mismo `SolicitanteGuard` de la 004). En línea, el cuerpo agrega `identidad`
  (contrato): la fachada de seguridad comprueba que es la identidad confirmada y `tramites` compara la
  huella del número de documento con `documento_hmac` del expediente; si no es el titular, 403 sin
  decir de quién es el expediente (FR-012). Los documentos se suben antes con `POST /documentos`, como
  en la 004, y se asocian a requisitos de `receta_al_presentar`. El expediente vuelve a EN_EVALUACION y
  `tramites.observacion.subsanada_en` se llena.
- El permiso de identidad no se "gasta" al subsanar (no crea expediente); sigue limitado a 30 minutos.

## R-10. Observación y denegación

- **Decisión**: la observación se guarda en `tramites.observacion` (ya existe). "Una sola observación"
  = no existe otra fila para el expediente. `plazo_subsanar_en` pasa a ser opcional (migración 0008):
  los plazos en días hábiles son de la 006, y el contrato deja de exigir `plazoSubsanarEn`. El motivo de
  denegación va al comentario del historial y al `detalle` de la auditoría.

## R-11. Auditoría

- **Decisión**: la migración 0008 agrega `INICIAR_EVALUACION` y `SUBSANAR` al CHECK de
  `tramites.auditoria`. Las acciones del evaluador usan los códigos que ya existen (`CONFIRMAR_RIESGO`,
  `CORREGIR_RIESGO`, `OBSERVAR`, `DENEGAR`, `APROBAR`). La consulta de jefatura devuelve
  `RegistroAuditoria` con `nombreUsuario` (nombre del personal, que no es dato del titular) obtenido de
  la fachada de seguridad. `VER_DETALLE` también aparece en la auditoría del expediente.

## R-12. Evento de cambio de estado

- **Decisión**: cada cambio de estado escribe `EstadoExpedienteCambiado` (`numeroExpediente`,
  `estadoAnterior`, `estadoNuevo`) en la misma transacción (FR-030). Nadie lo consume en esta
  funcionalidad; la 006 lo usará para las notificaciones.

## R-13. Portal

- **Decisión**: el detalle de la 004 muestra, según rol y estado, los botones Empezar revisión,
  Confirmar riesgo (con la lista de licencias del grupo), Observar, Denegar, Aprobar y Descargar
  esquela; cada uno envía la `version` leída en `If-Match` y, con 409 o 412, vuelve a cargar el detalle
  con un aviso. Pantallas nuevas `/personal/caja` (buscar, ver, confirmar y registrar) y
  `/personal/auditoria` (pagos por fechas y corrección de recibo). La consulta pública muestra el monto
  y "Descargar esquela" (con el `tokenConsulta`), y el texto de la observación cuando está OBSERVADO.

## R-14. Calidad en esta funcionalidad

- **Decisión**: sin k6, Lighthouse ni ZAP (la entrada los deja para el despliegue, 007); siguen
  obligatorias la cobertura ≥ 80 % y las 5 verificaciones de CI. Escenarios de calidad afectados:
  EQ-04 (permisos, auditoría y privacidad: matriz 401/403 y prueba de privacidad), EQ-02/EQ-03
  (consistencia: pago único y reintentos del despachador) y EQ-06 (módulos aislados: regla de
  dependencia).
