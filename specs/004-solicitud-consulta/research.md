# Investigación y decisiones: Presentar solicitud y consultar el estado del trámite

**Entrada**: [spec.md](./spec.md) (5 aclaraciones del 2026-11-18), `docs/sdd/004-solicitud-plan.md`,
la constitución v1.0.0 y lo ya construido en las funcionalidades 001 a 003.

No quedaron incógnitas abiertas en el contexto técnico. Cada decisión indica qué se eligió, por qué
y qué alternativas se descartaron.

## R-01. El representante también se valida con el servicio de identificación

- **Decisión**: si actúa un representante legal o apoderado, el servicio de identificación comprueba
  el titular (RUC + DNI con fecha de emisión, o carné de extranjería) **y** el documento del
  representante. El código se envía al celular de quien presenta. La carta poder o el poder inscrito
  en SUNARP se adjunta como documento del requisito `CON_REPRESENTANTE` y la revisa el evaluador.
- **Por qué**: lo piden RF06 y ADR-007 ("y los del representante legal o apoderado, si actúa uno").
  Resuelve la pregunta que quedó pendiente en la segunda sesión de `/speckit-clarify` con la opción
  recomendada; si la Municipalidad decide otra cosa, solo cambia el adaptador y una prueba.
- **Alternativas**: registrar el documento del representante sin comprobarlo (deja pasar una carta
  poder falsa a nombre de cualquiera).

## R-02. Puerto `ServicioIdentificacion` con adaptador simulado (seguridad)

- **Decisión**: puerto en `seguridad/dominio/puertos/servicio-identificacion.ts` con una sola
  operación, `verificar(datos)`, que responde `COINCIDE`, `NO_COINCIDE` o `NO_DISPONIBLE`. El adaptador
  `ServicioIdentificacionSimulado` (infraestructura) usa una tabla fija de personas ficticias
  documentada en [quickstart.md](./quickstart.md) y un tiempo de espera de 3 s; cualquier error o
  demora se traduce en `NO_DISPONIBLE`. Un número de documento reservado fuerza `NO_DISPONIBLE` para
  probar el 503.
- **Por qué**: el servicio real no está contratado (FR-004). El puerto aísla la regla ("sin identidad
  confirmada no se presenta") del proveedor; cambiar al real es cambiar un adaptador en el módulo.
- **Alternativas**: llamar a un servicio de pruebas público (no existe uno oficial sin contrato);
  aceptar cualquier dato en desarrollo (no permite probar `NO_COINCIDE` ni `NO_DISPONIBLE`).

## R-03. Verificación de identidad en línea (seguridad)

- **Decisión**: `POST /identidad/verificar` y `POST /identidad/verificar-otp`, en el módulo
  `seguridad`, reutilizando lo de la 002:
  - `seguridad.codigo_otp` con propósito `IDENTIDAD_ADMINISTRADO` (ya existe), 5 minutos y 5
    intentos; el envío simulado de la 002.
  - `seguridad.verificacion_identidad` (ya existe) guarda solo huellas HMAC: documento, RUC y, nuevo
    en la 0006, `representante_documento_hmac`. El celular queda como `destino_hmac` del código.
  - Al acertar el código se firma el `tokenIdentidad`: JWT de 15 minutos con audiencia
    `identidad-administrado` (distinta del token del personal, que no se acepta en su lugar ni al
    revés) y `jti` = id de la verificación. No lleva datos personales.
- **Por qué**: cumple FR-001 a FR-003 con las piezas probadas de la 002 y sin guardar datos en claro.
- **Alternativas**: un token opaco en Redis (otra pieza que puede fallar; el JWT ya existe en la
  002).

## R-04. Uso único del permiso sin escribir en el esquema de otro módulo

- **Decisión**: el permiso se "gasta" en el propio módulo `tramites`: `expediente.verificacion_id`
  (referencia lógica, sin FK) con un índice único parcial. Al presentar, el `INSERT` del expediente
  falla por unicidad si esa verificación ya se usó: la API responde 409, salvo que la
  `Idempotency-Key` y el cuerpo sean los mismos de esa presentación (entonces devuelve el mismo
  expediente, FR-020).
- **Por qué**: es atómico dentro de la misma transacción que crea el expediente y no obliga a
  `tramites` a escribir en `seguridad.verificacion_identidad` (principio III) ni a coordinar dos
  transacciones. La entrada proponía "gastarlo de forma atómica" desde la fachada de seguridad; el
  resultado es el mismo con menos piezas.
- **Alternativas**: `UPDATE seguridad.verificacion_identidad SET usada_en` desde la fachada antes de
  crear el expediente (si la creación falla después, el permiso queda gastado sin expediente);
  transacción compartida entre módulos (acopla los dos módulos a Prisma).

## R-05. La identidad no viaja en el token: se reenvía y se compara por huella

- **Decisión**: en línea, el cuerpo de `POST /expedientes` trae otra vez la identidad (`identidad`:
  tipo y número de documento, RUC, celular y representante) que el portal tiene en la memoria de la
  pestaña. La fachada de seguridad expone `confirmarIdentidadEnLinea(token, identidad)`, que verifica
  el token y compara las huellas HMAC con las de la verificación; si no coinciden, 403. En mesa de
  partes, la misma `identidad` (con fecha de emisión) se comprueba con
  `verificarIdentidadPresencial(identidad)`, que llama al servicio de identificación sin código.
- **Por qué**: así `seguridad` no guarda una copia cifrada de los datos personales solo para
  entregarlos después, y el expediente se crea con los datos que la persona confirmó. Se ajusta el
  contrato: `identidadPresencial` pasa a llamarse `identidad` y se usa en los dos canales.
- **Alternativas**: guardar la identidad cifrada en `verificacion_identidad` y devolverla por la
  fachada, como sugería la entrada (duplica datos personales y obliga a purgarlos); ponerla en el JWT
  (cualquiera puede leer el contenido de un JWT).

## R-06. El protector AES-256-GCM + HMAC pasa a `compartido`

- **Decisión**: `ProtectorDatosAesGcm` y su puerto `ProtectorDatos` se mueven de `seguridad` a
  `compartido/infraestructura` y `compartido/dominio`, sin cambiar el algoritmo, el formato
  (`iv ‖ tag ‖ texto`) ni las variables `CLAVE_CIFRADO_DATOS` y `CLAVE_HMAC_DATOS`. Seguridad y
  trámites lo reciben por inyección; las pruebas de la 002 siguen pasando sin cambios de
  comportamiento. Se ajusta `.dependency-cruiser.cjs` solo si la regla de `compartido` lo exige.
- **Por qué**: lo pide la nota de arquitectura de la entrada; importarlo desde dentro de `seguridad`
  rompería el aislamiento entre módulos.
- **Alternativas**: duplicar el protector en `tramites` (dos implementaciones del mismo cifrado con
  las mismas claves).

## R-07. Límites de intentos

- **Decisión**:
  - **Identidad**: el puerto `LimitadorIntentos` de seguridad suma dos operaciones con el mismo
    algoritmo de la 002 (reservar antes de verificar, liberar si fue válido, falla cerrado): 5 intentos
    por huella del documento y 5 por origen en 15 minutos para `verificar` y `verificar-otp`, y 3
    envíos de código por huella del celular en 15 minutos.
  - **Consulta pública** (aclaración 1): `tramites` tiene su propio `LimitadorConsultas` (Redis,
    contador atómico con script Lua, falla cerrado): 5 fallos por origen en 15 minutos; una consulta
    correcta no suma. La respuesta 429 trae `Retry-After`.
  - El origen sale de `req.ip` con `trust proxy` = `TRUST_PROXY_SALTOS` (002); la API nunca lee
    `X-Forwarded-For` por su cuenta.
- **Por qué**: FR-006, FR-032 y EQ-04 con el esquema ya probado en la 002.
- **Alternativas**: mover el limitador de la 002 a `compartido` (cambia código ya cerrado sin
  necesidad).

## R-08. Documentos subidos: tipo real, huella y almacén

- **Decisión**:
  - `POST /documentos` (multipart, campo `archivo`) acepta `tokenIdentidad` o la sesión de un usuario
    MESA_PARTES. Multer en memoria con límite de 10 MB (`fileSize`) → 413; nginx con
    `client_max_body_size 11m`.
  - El tipo real se comprueba por los primeros bytes, en una función pura del dominio
    (`detectarTipoArchivo`): `%PDF-` → PDF, `FF D8 FF` → JPEG, `89 50 4E 47 0D 0A 1A 0A` → PNG;
    cualquier otro → 415, sin importar la extensión ni el `Content-Type` enviado.
  - SHA-256 del contenido (`node:crypto`, en infraestructura) y guardado por el puerto
    `AlmacenArchivos`. Adaptador `AlmacenArchivosDisco` en un volumen de Docker
    (`ALMACEN_ARCHIVOS_RUTA`, fuera de la carpeta pública del portal), con nombres aleatorios (UUID)
    sin el nombre original. El adaptador compatible con S3 queda para la 010.
  - La fila va a `tramites.documento_temporal` con quién lo subió (`verificacion_id` o
    `usuario_id`). Al presentar, solo se aceptan documentos temporales subidos por el mismo
    solicitante (misma verificación o mismo usuario) y con menos de 24 horas.
- **Por qué**: FR-013 y SC-008 sin dependencias nuevas; la comprobación por bytes es una función
  pura que se prueba con muestras.
- **Alternativas**: la librería `file-type` (dependencia nueva y ESM-only para algo de tres firmas);
  guardar el archivo en PostgreSQL (`bytea`, encarece las copias de seguridad).

## R-09. Descarte de documentos abandonados

- **Decisión**: al presentar, un documento temporal de más de 24 horas ya no se acepta (422 en ese
  requisito), así que el límite se cumple al minuto. Además, una tarea cada hora (temporizador de la
  API con `pg_try_advisory_lock`, para que corra en una sola instancia) borra las filas y los
  archivos de más de 24 horas. No se usa `comun.ejecucion_tarea`, que registra una ejecución por día.
- **Por qué**: FR-014 sin agregar `@nestjs/schedule` (un `setInterval` con `unref()` y el candado
  basta) y sin depender de que la tarea corra a tiempo.
- **Alternativas**: tarea diaria con `ejecucion_tarea` (un archivo podría vivir hasta 48 horas);
  `@nestjs/schedule` (dependencia nueva para una sola tarea).

## R-10. Presentación atómica, número y receta al presentar

- **Decisión**: el caso de uso `PresentarSolicitud` corre en una transacción (puerto
  `UnidadDeTrabajoTramites`):
  1. Busca la `Idempotency-Key` en `tramites.clave_idempotencia`: si existe con la misma huella del
     cuerpo, devuelve ese expediente; con otra huella, 422.
  2. Lee la receta vigente por la fachada del catálogo (`obtenerRecetaVigente`); si no existe, está
     desactivada o es un trámite conectado, 422.
  3. La política de requisitos (dominio) decide obligatorios, opcionales y faltantes; si falta uno,
     422 con cada `requisitos[i]` faltante.
  4. Toma el número con `nextval('tramites.numero_expediente_seq')` (la secuencia ya existe en
     `esquema.sql`; pueden quedar huecos si una transacción falla) y arma `EXP-<año>-<6 dígitos>`.
  5. Inserta el expediente (con `receta_al_presentar` y `verificacion_id`), mueve los documentos
     temporales a `tramites.documento`, inserta el historial (REGISTRADO), la auditoría, el evento
     `SolicitudPresentada` en `comun.evento_pendiente` y la clave de idempotencia.
  Si cualquier paso falla, no queda nada. Dos envíos simultáneos con la misma clave chocan en la
  unicidad de `clave_idempotencia`; el segundo relee y devuelve el expediente del primero.
- **Por qué**: FR-016 a FR-020 y SC-007; el outbox es el de ADR-005. La entrada proponía una
  secuencia nueva; se reutiliza `numero_expediente_seq`, que ya existe con el mismo fin.
- **Alternativas**: correlativo por año en una tabla con bloqueo (aclaración 4 descartó el reinicio
  anual); idempotencia solo en Redis (se pierde si Redis falla).

## R-11. Política de requisitos (dominio)

- **Decisión**: función pura `clasificarRequisitos(receta, conRepresentante)`:
  - `SIEMPRE` → obligatorio;
  - `CON_REPRESENTANTE` → obligatorio si actúa un representante; si no, no aplica (no se muestra ni
    se acepta);
  - `GIRO_ESPECIAL` y `SIN_PLANOS_VIGENTES` → opcional, con su explicación (aclaración 3);
  - `faltantes(clasificacion, adjuntos)` devuelve los obligatorios sin documento.
  Se exponen los mismos datos al portal con `GET /catalogo/recetas/{codigo}` (003), así que el
  portal no necesita endpoint nuevo para armar el formulario. Una prueba recorre las 9 licencias
  contra `datos-semilla.sql`, con y sin representante (SC-006).
- **Alternativas**: preguntar por cada condición (descartado en la aclaración 3).

## R-12. Consulta pública

- **Decisión**: `POST /expedientes/consultar` normaliza el número (mayúsculas, sin espacios) y el
  documento, calcula su HMAC y busca `numero = $1 AND ($2 IN (documento_hmac, ruc_hmac))` con el
  índice `ix_expediente_consulta`. Si no hay fila, 404 con el mismo cuerpo siempre. Responde
  `EstadoPublico`: estado, descripción y siguiente paso en lenguaje sencillo (tabla
  `TEXTO_ESTADO_PUBLICO` en el dominio), licencia, ruta, fecha de presentación e historial; sin
  documento, RUC, celular, correo ni dirección. `Cache-Control: no-store`. El `tokenConsulta` del
  contrato pasa a ser opcional y no se emite en esta funcionalidad (sus descargas son de la 005 y la
  009).
- **Rendimiento (EQ-01)**: una lectura por índice y una del historial por consulta; sin caché
  compartida (tiene datos del titular). k6 con expedientes sembrados y consultas correctas.
- **Alternativas**: caché de la consulta en Redis (guardaría datos del titular fuera de la base para
  un ahorro de milisegundos).

## R-13. Bandeja y detalle del personal

- **Decisión**: `GET /expedientes` con `estado`, `ruta`, `pagina` y `porPagina` (máximo 50), orden
  `presentado_en DESC`, para MESA_PARTES, EVALUADOR y JEFATURA (aclaración 5). Los parámetros
  `asignadosAMi` (006) y `vencenAntesDe` (008) responden 422 "todavía no disponible" para que nadie
  crea que filtran. `GET /expedientes/{numero}` registra `VER_DETALLE` en la auditoría y muestra el
  documento enmascarado (`4*****21`) y la dirección descifrada. `GET
  /expedientes/{numero}/documentos/{id}` entrega el archivo por la API (200, `Content-Disposition:
  attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`) en lugar de la
  redirección firmada del contrato inicial, que necesita un almacén S3 (010).
- **Por qué**: FR-026 a FR-028 y FR-036.
- **Alternativas**: URL firmada local con HMAC propio (más código sin beneficio en un solo servidor).

## R-14. Portal

- **Decisión**: rutas `/tramite/identidad`, `/tramite/solicitud?licencia=<código>` y
  `/tramite/comprobante/<número>`; `/consulta`; `/personal/expedientes`,
  `/personal/expedientes/:numero` y `/personal/mesa-partes/nueva` con `RutaProtegida`. El
  `tokenIdentidad` y la identidad viven solo en la memoria de la pestaña (un contexto de React), nunca
  en `localStorage` ni en `sessionStorage`; si vence el permiso, se vuelve a `/tramite/identidad`
  conservando en memoria lo escrito. Botón "Presentar solicitud" en `FichaLicencia` (003). La
  consulta usa POST: el número y el documento no aparecen en la URL. El comprobante muestra el número
  (que sí puede ir en la ruta: no es dato personal) y se puede imprimir con estilos `@media print`.
- **Por qué**: FR-021, FR-035 y EQ-05.
- **Alternativas**: guardar el borrador del formulario en `sessionStorage` como en la 003 (aquí tiene
  datos personales).

## R-15. Pruebas y medición

- **Unitarias**: política de requisitos (9 licencias), `NumeroExpediente`, detección del tipo de
  archivo, textos públicos por estado, agregado `Expediente`, casos de uso con dobles.
- **Integración** (Supertest + PostgreSQL y Redis reales, respuestas validadas con Ajv): flujo en
  línea completo, presencial, 10 envíos en paralelo con la misma clave, permiso gastado (409) y
  vencido, matriz 401/403 de cada endpoint nuevo, fuerza bruta (429 en el 6.º intento), servicio
  `NO_DISPONIBLE` (503), archivos renombrados y de más de 10 MB, atomicidad con un fallo forzado y
  privacidad (registros capturados sin datos de prueba).
- **Calidad**: `tests/carga/eq01-consulta.js` (k6, 100 y 1,000 usuarios), Lighthouse móvil en
  identidad, solicitud, comprobante y consulta, y el recorrido del quickstart en un clon aislado.
