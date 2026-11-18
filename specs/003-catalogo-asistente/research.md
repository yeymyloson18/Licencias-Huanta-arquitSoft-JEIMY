# Investigación (fase 0): Catálogo y Asistente de ruta

Decisiones técnicas de la funcionalidad 003. Entrada: [spec.md](./spec.md) (5 aclaraciones del
2026-11-18), `docs/sdd/003-catalogo-plan.md` y el código de las funcionalidades 001 y 002. No quedan
puntos "NEEDS CLARIFICATION".

## R-01. Forma de la respuesta del asistente

- **Decisión**: `POST /asistente/proponer` responde **200** con un objeto discriminado por
  `resultado`:
  - `{ "resultado": "PROPUESTA", "receta": Receta }`
  - `{ "resultado": "NO_DETERMINADA", "motivo": "SIN_REGLA" | "RECETA_NO_DISPONIBLE" }`

  **422** queda solo para respuestas inválidas (falta una pregunta, sobra un código o el valor no
  está entre las opciones), con `errores[].campo = "respuestas.<CODIGO_PREGUNTA>"`.
- **Por qué**: "no se pudo determinar" es un resultado válido del negocio (FR-006), no un error del
  cliente. Un 404 o un 422 obligaría al portal a distinguir entre errores y le complicaría los
  reintentos. El `motivo` sirve a las pruebas y a los registros; **el portal muestra el mismo
  mensaje en los dos casos**.
- **Mensaje sin código fijo**: el portal no sabe qué opción eligió el visitante cuando no hay regla
  (por ejemplo, "No lo sé"), y no debe saberlo, porque eso fijaría un valor de opción en el código
  (FR-002). Por eso el escenario 7 de la historia 1 usa el mensaje genérico (ya se ajustó la spec).
- **Alternativas**: 404 cuando no hay regla (lo descarté porque mezcla "no existe" con "no
  determinable"); devolver una lista de licencias candidatas (descartado en la aclaración 2).

## R-02. Motor de reglas del asistente (función pura del dominio)

- **Decisión**: `proponerLicencia(preguntas, reglas, respuestas)` en
  `dominio/motor-reglas-asistente.ts`, sin dependencias externas:
  1. `validarRespuestas`: exige exactamente una respuesta por pregunta y cada valor dentro de sus
     opciones; devuelve la lista de errores por pregunta.
  2. Ordena las reglas por `prioridad` ascendente (son únicas por restricción de la base).
  3. Una regla coincide si **cada** par `pregunta → valor` de sus condiciones es igual a la
     respuesta; las preguntas que la regla no menciona no importan.
  4. Devuelve `{ tipo: 'PROPUESTA', codigoReceta }` con la primera que coincide, o
     `{ tipo: 'NO_DETERMINADA', motivo: 'SIN_REGLA' }`.

  El caso de uso `ProponerLicencia` busca la receta propuesta. Si está desactivada o no existe,
  devuelve `NO_DETERMINADA / RECETA_NO_DISPONIBLE` **sin evaluar más reglas** (aclaración 4).
- **"No lo sé"**: es una opción más (`NO_SE`) de `NIVEL_RIESGO`, agregada por migración. Ninguna
  regla la menciona y el motor no la conoce: cae en `SIN_REGLA` salvo que una regla de mayor
  prioridad ya coincida (bodega o corporativo).
- **Pruebas**: tabla de las 30 combinaciones (3 × 2 × 5) con el resultado esperado, más casos de
  respuestas inválidas y de receta desactivada. Los expedientes reales (documento 09, paso 4) se
  agregan como filas de la misma tabla.
- **Alternativas**: evaluar las reglas en SQL (deja la lógica del TUPA fuera del dominio, contra el
  principio I); un motor de reglas de terceros como json-rules-engine (dependencia externa en el
  dominio, contra el principio I; además es innecesario para una igualdad de pares).

## R-03. Receta editable: entidad y validaciones (FR-017 a FR-020)

- **Decisión**: el dominio pasa de un modelo de solo lectura a la entidad `RecetaCompleta`, que
  incluye calificación, ITSE, vigencia, estado y requisitos. Su función pura
  `aplicarCambios(receta, cambios)` devuelve `{ receta, diferencias }` o lanza
  `ErrorValidacionReceta` con **todas** las fallas por campo, no solo la primera.
- **Reglas** (además de los objetos de valor existentes `Tasa` y `PlazoDiasHabiles`):

  | Regla | Detalle |
  |---|---|
  | Tasa | `Tasa.desdeTexto` (≥ 0, 2 decimales como máximo) y máximo `99999999.99` (lo que admite `numeric(10,2)`) |
  | Plazo | entero ≥ 1 (la receta puede seguir sin plazo si ya no lo tenía; el contrato no permite pasarlo a `null`) |
  | Vigencia | `null` (indeterminada) o entero ≥ 1 |
  | Coherencia de una licencia con su ruta | **A**: `APROBACION_AUTOMATICA` + `POSTERIOR` + plazo del ITSE ≥ 1. **B**: `EVALUACION_PREVIA_SILENCIO_POSITIVO` + `PREVIA` + plazo del ITSE ≥ 1. **C**: `APROBACION_AUTOMATICA` + `DENTRO_6_MESES` + plazo del ITSE `null` (los 6 meses son fijos, como en la semilla de LIC-09) |
  | Trámite conectado | sin orden del ITSE, sin plazo del ITSE y sin vigencia; calificación `APROBACION_AUTOMATICA` o `SERVICIO_EXCLUSIVO` |
  | Requisitos | de 1 a 30; texto recortado (`trim`) de 1 a 500 caracteres; condición dentro de las 4 existentes; `id` de un requisito de la misma receta o sin `id` (nuevo) |

  La tabla de coherencia por ruta es **dato del dominio** (`COHERENCIA_POR_RUTA`), no una cadena de
  `if`. Así queda en un solo lugar si la Municipalidad la cambia.
- **Qué no se edita** (FR-018): el código, el nombre, el tipo, la ruta, el código y la página del
  TUPA, el nivel de riesgo y las marcas de cesionario y corporativa. Si un cuerpo los incluye, se
  rechaza (`additionalProperties: false`).
- **Alternativas**: validar solo con zod en la presentación (dejaría las reglas del TUPA fuera del
  dominio y sin pruebas puras).

## R-04. Requisitos: identidad, reorden y restricción única

- **Problema**: `requisito` tiene `UNIQUE (codigo_receta, orden)`, y `tramites.documento.requisito_id`
  (funcionalidad 004) apuntará al `id` del requisito. Si se borra la lista y se vuelve a insertar,
  cambian los `id`. Si se actualizan los requisitos uno por uno, el reordenamiento choca con la
  restricción única.
- **Decisión**:
  - En `RecetaEditable.requisitos`, cada elemento lleva un `id` **opcional**: con `id` se actualiza
    ese requisito; sin `id` se crea uno nuevo; los que faltan en la lista se borran. Si se envía
    `requisitos`, reemplaza la lista completa.
  - El `orden` lo fija la **posición en la lista** (1, 2, 3…). El campo `orden` del cuerpo deja de
    exigirse y, si se envía, se ignora (FR-020).
  - La migración `0004` vuelve la restricción `DEFERRABLE INITIALLY DEFERRED`, así que se verifica
    al confirmar la transacción y no fila por fila.
  - La columna `acepta_archivo` no se edita; los requisitos nuevos toman su valor por defecto
    (`true`).
- **Alternativas**: dejar la restricción normal y reordenar en dos pasadas con órdenes negativos
  temporales (más frágil y más consultas); borrar y volver a insertar (rompe los `id` que usará la
  004).

## R-05. Registro de cambios atómico con "gana el último" (FR-021 a FR-023)

- **Decisión**:
  - Nueva tabla `catalogo.cambio_receta` ([data-model.md](./data-model.md)), con FK hacia `receta`
    porque está en el mismo esquema y **sin FK** hacia `seguridad.usuario` (MD2).
  - `ActualizarReceta` corre en una transacción de la base (puerto `UnidadDeTrabajoCatalogo`):
    1. `SELECT … FOR UPDATE` de la receta y sus requisitos. Así dos guardados simultáneos se
       ordenan, y el valor "antes" de cada registro es el que estaba guardado en ese momento
       (aclaración 5).
    2. `aplicarCambios` (dominio). Si `diferencias` está vacío, no escribe nada y devuelve la receta
       (FR-022).
    3. Actualiza la receta (`actualizada_por`, `actualizada_en`), aplica la diferencia de los
       requisitos e inserta el `cambio_receta`.
  - El formato de `cambios` es `{ "<campo>": { "antes": …, "despues": … } }`. Para `requisitos`
    guarda la lista completa (sin `id`) antes y después.
  - No hay `If-Match` ni versión: gana el último que guarda (aclaración 5).
- **Por qué**: cumple el principio VII (auditoría en la misma transacción) con el mínimo de piezas.
  `FOR UPDATE` no bloquea a los lectores del catálogo.
- **Alternativas**: un trigger de auditoría en PostgreSQL (pone lógica del negocio en la base y no
  conoce al usuario sin variables de sesión); bloqueo optimista (descartado en la aclaración 5).

## R-06. Caché y tiempo máximo de propagación (FR-024, EQ-06)

- **Claves en Redis**:

  | Clave | Contenido | Se borra al guardar |
  |---|---|---|
  | `catalogo:recetas:TODOS`, `:LICENCIA`, `:TRAMITE_CONECTADO` | lista pública (existe desde la 001) | sí, las tres |
  | `catalogo:receta:<CODIGO>` | receta completa, activa o no | sí, la de esa receta |
  | `catalogo:asistente` | preguntas y reglas | no (solo cambian por migración; al desplegar se borra con el TTL) |

- **Invalidación**: el decorador `RepositorioCatalogoConCache` envuelve también la escritura; borra
  las claves **después** de confirmar la transacción. Si Redis falla al borrar, registra un aviso y
  el TTL pone el límite.
- **Límite de 5 minutos aunque falle la invalidación**: TTL de Redis **240 s** +
  `Cache-Control: public, max-age=60` en las respuestas públicas GET = 300 s.
  - `CATALOGO_CACHE_TTL_SEGUNDOS` pasa a valer **240** por defecto, con un máximo validado de 240:
    la API no arranca con un valor mayor y el error nombra la variable.
  - La carrera de cache-aside (un lector toma el valor viejo de la base antes de que se confirme el
    cambio y lo guarda después del borrado) también queda acotada por esos 240 s.
- **Respuestas que no se guardan en caché**: el 404 de una receta desactivada o inexistente, la
  propuesta del asistente (es POST) y todos los endpoints de `/admin` y el PUT (`no-store`).
- **Documentación**: se corrige la línea de ADR-005 en
  `docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md`. Antes decía "Redis 300 s"; ahora
  dice "5 minutos en total = Redis 240 s + navegador 60 s".
- **Alternativas**: publicar la invalidación por Pub/Sub a cachés en memoria de cada instancia (más
  piezas sin beneficio, porque no hay caché en memoria); `max-age=0` (pierde la ayuda de la caché
  del navegador y del CDN para EQ-01).

## R-07. Cambios en el contrato OpenAPI

- **Decisión**: detalle completo en [contracts/openapi-cambios.md](./contracts/openapi-cambios.md):
  - **Nuevas**: `GET /admin/catalogo/recetas` y `GET /admin/catalogo/recetas/{codigoReceta}`.
  - **Modificadas**: `GET /catalogo/recetas` (`max-age=60`), `GET /catalogo/recetas/{codigoReceta}`
    (404 si está desactivada), `PUT /catalogo/recetas/{codigoReceta}` (responde `RecetaAdmin`,
    `no-store`) y `POST /asistente/proponer` (`ResultadoAsistente`).
  - **Esquemas**: `RecetaAdmin` (`Receta` + `activa` + `actualizadaEn`), `ResultadoAsistente`;
    `RecetaEditable` con `additionalProperties: false`, un `id` opcional y sin `orden` obligatorio
    en los requisitos, y `ordenItse` / `plazoItseDias` que admiten `null`.
- **Rutas de administración**: la entrada pide `/admin/catalogo/...` para leer y deja el PUT en
  `/catalogo/recetas/{codigo}`. Se mantiene así para no romper el contrato publicado. El PUT
  protegido convive con el GET público en la misma ruta, como ya define el contrato.

## R-08. Migración `0004` y datos semilla (principio III)

- **Problema**: `migraciones.spec.ts` exige que `0002_datos_semilla` sea **copia literal** de
  `datos-semilla.sql`. La entrada pide que `datos-semilla.sql` muestre la opción "No lo sé", pero
  `0002` ya está aplicada y no se puede editar.
- **Decisión** (continúa la línea de la 002, §R-15):
  - `0002` se **congela** con su SHA-256, igual que `0001`.
  - `datos-semilla.sql` pasa a describir los datos semilla **actuales**, con "No lo sé".
  - `0004_catalogo_asistente/migration.sql`:
    - crea `catalogo.cambio_receta`;
    - vuelve diferible la restricción única de `requisito`;
    - agrega `{"valor":"NO_SE","texto":"No lo sé"}` a `NIVEL_RIESGO`.
  - `esquema-equivalente.e2e-spec.ts` compara además los **datos** de las tablas de referencia del
    catálogo (`receta`, `requisito`, `pregunta_asistente`, `regla_asistente`) y `seguridad.rol`,
    fila por fila y ordenados por clave, entre la base creada con los documentos y la base migrada.
- **Documentos actualizados en el mismo PR**: `esquema.sql`, `datos-semilla.sql`,
  `modelo-entidad-relacion.md` (diagrama y diccionario) y `schema.prisma` (regenerado con
  `db pull`).

## R-09. Portal: asistente, ficha y edición

- **Rutas**: `/asistente`, `/licencias/:codigo`, `/admin/catalogo` y `/admin/catalogo/:codigo`
  (estas dos con `RutaProtegida roles={['ADMINISTRADOR']}`). Detalle en
  [contracts/portal-catalogo.md](./contracts/portal-catalogo.md).
- **Estado del asistente en la URL**: `/asistente?TIPO_ESTABLECIMIENTO=OTRO&ES_CESIONARIO=NO`.
  - La pregunta actual es la primera sin respuesta. "Volver" quita la última respuesta y
    "Empezar de nuevo" las quita todas.
  - Sobrevive a la recarga y al botón atrás del navegador, y no guarda nada en el servidor (FR-009).
  - No son datos personales, así que no contradice el principio VII.
  - Los valores desconocidos de la URL se descartan y el asistente vuelve a la primera pregunta
    inválida.
- **Ficha reutilizable**: el componente `FichaLicencia` lo usan la propuesta del asistente y
  `/licencias/:codigo`. Los textos fijos de la interfaz traducen los códigos del contrato a lenguaje
  sencillo: calificación, orden del ITSE y condición del requisito son enumeraciones del contrato,
  no contenido del catálogo.
- **Accesibilidad**:
  - Las opciones son `radio` dentro de un `fieldset` con `legend`.
  - Al cambiar de pregunta, el foco va al título y el avance "Pregunta N de 3" se anuncia con
    `aria-live="polite"`.
  - En la edición, los errores aparecen junto a cada campo (`aria-describedby`), además de un
    resumen enfocable.
  - Botones de al menos 44 × 44 px y sin estilos en línea, por la CSP de la 002.
- **Guardar sin cambios**: el formulario compara con lo cargado y, si no cambió nada, avisa "No hay
  cambios para guardar" sin llamar a la API. Si aun así llega un PUT igual, la API responde 200 y
  no crea registro (FR-022).

## R-10. Prueba de carga de EQ-01 (k6)

- **Decisión**: `tests/carga/eq01-catalogo.js`, en la raíz del repositorio, como pide la entrada.
  - Mezcla de peticiones: 50 % lista, 30 % ficha y 20 % preguntas + propuesta.
  - Umbrales: `http_req_duration p(95) < 2000` y `http_req_failed < 0.01`.
  - Los usuarios virtuales y la duración se leen de variables (`USUARIOS`, `DURACION`).
- **Ejecución**: con la imagen `grafana/k6` fijada a una versión concreta, contra el stack local.
  - En local se usa una escala reducida (100 usuarios virtuales, 2 minutos), documentada como prueba
    de humo.
  - La medición con 1,000 usuarios queda para el entorno desplegado. Grafana + Prometheus no forman
    parte del stack local; el resumen de k6 da el p95 y la tasa de errores.
- No se agrega a CI, porque una prueba de carga en el runner compartido no es representativa. Se
  documenta en el README.

## R-11. Permisos, datos personales y registros

- Los endpoints de administración usan `@RequiereRoles('ADMINISTRADOR')` y `@UsuarioActual()`
  importados de `modulos/seguridad/fachada.ts` (principio I; la regla de dependencia ya lo permite).
- `cambio_receta.usuario_id` y los registros de la aplicación guardan solo el identificador
  interno. Los registros usan el formato `receta actualizada codigo=LIC-02 usuarioId=… campos=tasa`,
  sin valores de requisitos ni datos del administrador (FR-026).
- El asistente no recibe datos personales; las respuestas no se registran.

## R-12. Auditorías de calidad

- **Lighthouse móvil** (SC-008) con el mismo procedimiento de la 002 (`--extra-headers` con la
  cookie para la pantalla de administración), sobre:
  - `/asistente`
  - `/asistente?…` con las tres respuestas, para ver la propuesta
  - `/licencias/LIC-03`
  - `/admin/catalogo/LIC-02`
- **Prueba a 360 px** con Testing Library y Lighthouse. La comprobación visual en un navegador
  angosto queda como verificación manual del quickstart.
