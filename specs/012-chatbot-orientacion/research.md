# Investigación: Chatbot de orientación (012)

Decisiones de la fase 0. Cada una con lo decidido, el motivo y las alternativas descartadas.

## R-01. Módulo nuevo `orientacion` y enmienda de la constitución

- **Decisión**: un módulo nuevo `apps/api/src/modulos/orientacion/` con las cuatro capas. Se
  acompaña, en el mismo PR y como primera tarea, de una enmienda MINOR de la constitución
  (1.0.0 → 1.1.0):
  - el principio I pasa de 9 a 10 módulos (agrega "Orientación");
  - "Restricciones de alcance" saca de "fuera de alcance" el chat de orientación del portal; el
    asistente por WhatsApp (RC13) sigue en la Fase 2.
- **Motivo**: lo pidió la usuaria. La orientación no es una regla del catálogo ni del trámite:
  depende de un servicio externo y puede fallar sin afectar a nadie. Aislada, su falla y su
  dependencia quedan en un solo lugar (EQ-03, EQ-06). La gobernanza permite enmendar en un PR que
  explique el motivo y actualice `docs/`.
- **Alternativas**:
  - dentro de `catalogo`: mezcla un servicio externo no confiable con las reglas del TUPA, y el
    catálogo pasaría a depender de la red;
  - en `operacion/`: es para salud y operación del sistema, no para casos de uso del administrado.

## R-02. Lectura del catálogo por la fachada (con su caché)

- **Decisión**: el módulo define un puerto `FuenteCatalogo` en `dominio/` y su adaptador
  `FuenteCatalogoFachada` en `infraestructura/`, que usa solo `FachadaCatalogo`:
  - `listarRecetas({ tipo: 'LICENCIA' })` para conocer las licencias activas;
  - `obtenerRecetaVigente(codigo)` para cada una (nombre, ruta, tasa, plazo, calificación, ITSE,
    vigencia y requisitos).

  Las dos pasan por `RepositorioCatalogoConCache` (Redis, TTL ≤ 240 s), así que un cambio de receta
  llega al chat como mucho en 4 minutos, igual que al portal (FR-012, EQ-06).
- **Motivo**: principio I (solo fachada) y pedido de la usuaria (nunca tablas del catálogo). La
  fachada ya devuelve `RecetaVigenteDto` con todo lo necesario; no hace falta cambiarla.
- **Alternativas**:
  - un método nuevo `listarRecetasVigentes()` en la fachada: ahorra llamadas, pero son 9 recetas en
    caché; si la medida lo exige, se agrega después sin cambiar el puerto;
  - leer el esquema `catalogo`: prohibido (principio III).

## R-03. Guía de preguntas frecuentes como datos versionados

- **Decisión**: la guía es un archivo de datos `apps/api/src/modulos/orientacion/infraestructura/guia/guia-orientacion.json`. Cada tema tiene:
  - `id`, `titulo` y `palabrasClave`;
  - `respuesta` aprobada;
  - `enlaces` opcionales.

  Se valida con zod al arrancar (si es inválida, la API no arranca) y se lee una vez. El puerto
  `FuenteGuia` la entrega al caso de uso.
- **Temas iniciales** (redactados del TUPA 2024 y de este sistema):
  - rutas A, B y C;
  - ITSE previa, posterior y dentro de 6 meses;
  - pago presencial con esquela en caja;
  - estados del expediente;
  - cómo presentar, subsanar y consultar;
  - silencio positivo y aprobación automática;
  - vigencia;
  - trámites no atendidos (transferencia, cambio de giro y duplicado);
  - horario y canales de la Municipalidad (solo si la Municipalidad los confirma; si no, el tema
    dice "consulte en Mesa de partes").
- **Motivo**: FR-012 pide cambiarla sin tocar el código del chat; cambiar un JSON revisado en un PR
  cumple eso y no necesita migración ni pantalla de edición, que la especificación deja fuera. No
  hay tablas nuevas (principio III intacto).
- **Alternativas**:
  - tabla en un esquema `orientacion`: necesita migración y una pantalla que nadie pidió;
  - Markdown: más difícil de validar y de partir por temas.

## R-04. Selección del contexto que se envía al proveedor

- **Decisión**: una función pura de dominio, `seleccionarContexto(pregunta, historial, recetas,
  guia)`, arma el contexto con dos partes:
  - **Siempre**: una tabla compacta de todas las licencias vigentes (código, nombre, ruta, tasa,
    plazo y tipo de plazo, calificación, ITSE). Son 9 filas.
  - **Según la pregunta**: hasta 2 recetas con sus requisitos completos y hasta 4 temas de la
    guía, elegidos por coincidencia de palabras normalizadas. La normalización quita tildes,
    mayúsculas y palabras vacías, y usa las palabras clave de cada tema y el nombre de cada receta.
    Sin coincidencias, se envían los 3 temas generales: rutas, presentar y consultar.
- **Motivo**:
  - El nivel gratuito limita tokens por minuto y por día. Enviar todo el catálogo con todos los
    requisitos y toda la guía en cada pregunta gasta la cuota en pocas preguntas.
  - Con 9 recetas y unos 20 temas, la coincidencia por palabras es suficiente y se prueba sin red.
  - La tabla compacta permite comparar licencias ("¿cuál es más barata?").
- **Alternativas**:
  - embeddings o base vectorial: una dependencia y un servicio más, para un corpus muy chico;
  - enviar todo: más preciso, pero gasta la cuota (se puede activar por configuración si el
    proveedor lo permite).

- **Corrección por una conversación real (2026-11-24, FR-027 a FR-030)**: "que documentos tengo que
  presentar" → "par ala categoria mas basica" → "cuales son esos documento requeridos" terminó en
  SIN_INFORMACION porque la selección solo miraba los turnos PERSONA y "basica" no coincidía con
  "riesgo bajo". Ahora:
  - el puntaje de cada licencia suma, en este orden de peso, un código en la pregunta actual (1000),
    las palabras de la pregunta actual (300 + coincidencia), las licencias que nombraron las
    respuestas anteriores del chat (100 + recencia; por los `codigosReceta` del turno, que el portal
    toma de los enlaces a fichas, o por un `LIC-xx` en el texto) y las palabras de las preguntas
    anteriores;
  - `dominio/sinonimos.ts` agrega equivalencias en español sencillo ("básica", "más simple",
    "pequeño negocio" → bajo; "documentos", "papeles" → requisitos; "tienda", "abarrotes" →
    bodega);
  - si la pregunta pide requisitos y no hay licencia identificada, el caso de uso pregunta por el
    tipo de negocio sin llamar al proveedor;
  - la guía tiene el tema "¿Qué es el TUPA?" y las reglas dicen que el TUPA, la Municipalidad y este
    sistema son del tema.

## R-05. Adaptador del proveedor: `fetch` nativo y `AbortController`

- **Decisión**: `ProveedorIaCompatibleOpenAI` en `infraestructura/` implementa el puerto
  `ProveedorOrientacion`:
  - llama a `POST {ORIENTACION_API_URL}/chat/completions` con `fetch` (Node ≥ 24) y
    `Authorization: Bearer <clave>`;
  - corta a los 15 s con `AbortController` (`AbortSignal.timeout(15_000)`);
  - cuerpo: `model`, `messages` (sistema y conversación), `temperature: 0.2`, un máximo de tokens
    de salida (600) y `response_format: { type: 'json_object' }`.
- **Clasificación de errores** (nunca se copia el cuerpo de la respuesta del proveedor a los
  registros):

  | Situación | Resultado del puerto |
  | --- | --- |
  | Se aborta por tiempo | `TIEMPO_AGOTADO` |
  | HTTP 429 | `CUOTA_AGOTADA` |
  | HTTP 401 o 403 | `CLAVE_INVALIDA` |
  | Otro error HTTP o de red | `FALLA` |
  | JSON vacío o fuera del esquema | `RESPUESTA_INVALIDA` |
  | Sin clave configurada | `NO_CONFIGURADO`, sin llamar a la red |

- **Motivo**: pedido de la usuaria. La API de chat completions es un POST con JSON; un SDK
  agregaría una dependencia sin beneficio y ataría el código a un proveedor. Cambiar de proveedor
  compatible o de modelo es solo cambiar las variables (FR-022).
- **Alternativas**:
  - SDK `openai`: dependencia extra, con reintentos propios difíciles de controlar;
  - `undici` directo: ya es el motor de `fetch`.
- **A verificar con el proveedor real** (quickstart, evaluación EQ-08): que el modelo por defecto
  acepte `response_format: json_object`. Si no lo acepta, se quita por configuración
  (`ORIENTACION_FORMATO_JSON=false`) y la respuesta se interpreta igual: se busca el primer objeto
  JSON del texto y, si no lo hay, es `RESPUESTA_INVALIDA`.

## R-06. Respuesta estructurada y revisión de cifras (FR-005)

- **Decisión**: el mensaje de sistema pide un objeto JSON
  `{ "tipo": "RESPONDIDA" | "SIN_INFORMACION" | "FUERA_DE_TEMA" | "CONSULTA_TRAMITE", "texto":
  string, "codigosReceta": string[] }`. El sistema no confía en el modelo:
  1. `interpretarRespuesta` (dominio) valida el objeto con comprobaciones de tipos propias, sin
     zod: el dominio no importa paquetes externos (principio I). Si no cumple, es una falla del
     proveedor.
  2. Descarta los `codigosReceta` que no están entre las licencias vigentes. Los enlaces a la ficha
     los arma el sistema a partir de los códigos válidos; el modelo nunca escribe URLs.
  3. `revisarCifras(texto, contexto)` (función pura del dominio):
     - extrae montos (`S/ 123.45`, `S/. 123`, `123.45 soles`) y plazos (`N días`, `N días
       hábiles`, `N meses`);
     - si alguno no está en el contexto enviado (las tasas, plazos y vigencias de las recetas y las
       cifras de los temas de la guía), el resultado pasa a `SIN_INFORMACION` con el texto fijo de
       FR-006 y se registra `RECHAZADA_POR_REVISION`.
  4. El texto se limita a 1,200 caracteres y se devuelve como texto plano. El portal nunca lo
     interpreta como HTML.
  5. Si `tipo` es `RESPONDIDA` y hay datos del TUPA, se agrega la aclaración fija de FR-008.
- **Motivo**: "nunca inventa" no se puede garantizar solo con instrucciones; la revisión lo hace
  verificable con pruebas unitarias (SC-002).
- **Alternativas**:
  - confiar en el mensaje de sistema: no es comprobable;
  - armar respuestas solo con plantillas: no entiende preguntas libres, que es el objetivo.

## R-07. Quitar datos personales (FR-014) antes del proveedor y de cualquier registro

- **Decisión**: una función pura `quitarDatosPersonales(texto)` devuelve `{ texto, quitados:
  boolean }` y reemplaza por `[dato personal]`:
  - **correos**: patrón usual `usuario@dominio.tld`;
  - **celulares**: `(?:\+?51[\s-]?)?9(?:[\s-]?\d){8}`, con o sin espacios y guiones;
  - **RUC**: 11 dígitos que empiezan con 10, 15, 17 o 20;
  - **DNI**: 8 dígitos aislados (`\b\d{8}\b`);
  - **carné de extranjería**: 9 dígitos aislados, que la 004 también acepta.

  Se aplica en este orden (correo, celular, RUC, DNI y CE) para que una secuencia larga no se corte
  en otra más corta. También se aplica a cada texto del `historial` que manda el portal: el portal
  no es confiable.
- **Qué no se toca**: los números de expediente (`EXP-2026-000123`), años, áreas y montos no
  tienen esas formas. Las pruebas incluyen falsos positivos conocidos, como "120 m²", "2024" y
  "S/ 177.10".
- **Registros**: el caso de uso nunca pasa la pregunta ni la respuesta al Logger. El controlador
  registra solo `resultado`, `duracionMs`, `modelo` y `datoPersonalQuitado`. El filtro de errores
  existente no incluye el cuerpo de la petición.
- **Motivo**: principio VII y Ley N.° 29733.
- **Alternativas**:
  - detección de nombres propios con un modelo: poco confiable en español y requiere otra
    dependencia;
  - no enviar la pregunta: haría imposible el chat.

## R-08. Límite por persona: Redis, como el límite de intentos de la 002, con huella con sal

- **Decisión**: el puerto `LimitadorPreguntas` y su adaptador `LimitadorPreguntasRedis` usan el
  mismo algoritmo de `LimitadorIntentosRedis` de la 002:
  - `INCR`, `EXPIRE … NX` y `TTL` en un `MULTI`, con ventana fija de 15 minutos;
  - máximo 10 (`ORIENTACION_LIMITE_PREGUNTAS`, por defecto 10);
  - `segundosRestantes` para `Retry-After`.

  La clave es `lim:orientacion:<huella>`:
  - `huella = hex(HMAC-SHA256(CLAVE_HMAC_DATOS, "orientacion:" + ip))`, con el puerto compartido
    `ProtectorDatos`;
  - la sal secreta es `CLAVE_HMAC_DATOS` y el prefijo `orientacion:` separa esta huella de la
    huella de auditoría de la 009;
  - la IP no se guarda en Redis ni en los registros.

  La IP sale de `peticion.ip`, con `trust proxy` = `TRUST_PROXY_SALTOS`, igual que en la 002.
- **Si Redis no responde**: falla cerrado con 503 `orientacion-no-disponible`. El chat ofrece el
  asistente y se protege la cuota.
- **Cuándo se reserva**: solo las preguntas válidas, en el caso de uso, antes de llamar al
  proveedor. Las que se rechazan por largo o vacías no cuentan; las que fallan en el proveedor sí
  cuentan (gastan cuota igual).
- **Motivo**: pedido de la usuaria. Comparte Redis entre instancias (ADR-005). El adaptador vive
  en `orientacion` porque un módulo no puede importar `seguridad/infraestructura` (principio I).
- **Alternativas**:
  - mover el contador a `compartido/` y que la 002 lo use: refactor de seguridad fuera de alcance,
    queda como mejora;
  - limitar en nginx: no da el mensaje con minutos ni la respuesta 429 con Problema.
- **Observación aparte**: la 002 usa la IP en claro en sus claves (`lim:fallos:ip:<ip>`). No se
  cambia en esta funcionalidad; queda anotado como posible mejora.

## R-09. Configuración y secretos

- **Decisión**: variables nuevas en el esquema zod de `compartido/infraestructura/configuracion.ts`:

  | Variable | Uso y valor por defecto |
  | --- | --- |
  | `ORIENTACION_API_URL` | URL base; vacío → `https://api.groq.com/openai/v1` |
  | `ORIENTACION_MODELO` | Vacío → `openai/gpt-oss-120b` |
  | `ORIENTACION_API_KEY` | Vacío → chat desactivado (`NO_CONFIGURADO`); la API arranca igual |
  | `ORIENTACION_TIEMPO_MAXIMO_MS` | 15000 |
  | `ORIENTACION_LIMITE_PREGUNTAS` | 10 |
  | `ORIENTACION_FORMATO_JSON` | `true` |

- **En producción**: si hay clave, la URL debe ser `https://`; si no lo es, la API no arranca y el
  error nombra solo la variable.
- **Dónde se declaran**:
  - `infra/docker-compose.yml` (y `infra/produccion/docker-compose.yml`), con valores vacíos por
    defecto (`${ORIENTACION_API_KEY:-}`);
  - `.env.example`, sin clave, con un comentario de dónde obtenerla;
  - la clave real queda solo en `infra/.env`, que no se sube al repositorio.
- **La clave nunca aparece**:
  - en el objeto que se registra al arrancar;
  - en los mensajes de `ErrorConfiguracion`;
  - en los errores del adaptador.

  Una prueba unitaria comprueba que ninguna salida contenga una clave ficticia.
- **CI**: no se define ningún secreto del proveedor. Las pruebas corren sin clave o con el
  proveedor simulado.

## R-10. Contrato HTTP: un solo endpoint público

- **Decisión**: `POST /orientacion/preguntas` (etiqueta nueva "Orientación", `security: []`) con
  `{ pregunta, historial }` y `Cache-Control: no-store`. Detalle en
  [`contracts/api-orientacion.md`](contracts/api-orientacion.md).
- **Respuestas**:

  | Código | Cuándo |
  | --- | --- |
  | 200 | Con `resultado` (`RESPONDIDA`, `SIN_INFORMACION`, `FUERA_DE_TEMA`, `CONSULTA_TRAMITE`, `NO_DISPONIBLE`) |
  | 422 | Pregunta vacía, de más de 500 caracteres o historial inválido |
  | 429 | Límite superado, con `Retry-After` |
  | 503 | El límite no se puede comprobar |

- **Motivo**: con el proveedor caído, el 200 con `NO_DISPONIBLE` y sus enlaces es una respuesta
  válida del chat (FR-021), no un error del sistema. El 429 y el 503 siguen las respuestas comunes
  del contrato (`DemasiadosIntentos` y `ServicioNoDisponible`).
- **Alternativas**:
  - `GET` con la pregunta en la URL: prohibido (principio VII);
  - streaming (SSE): más complejo de probar y de pasar por nginx; las respuestas son cortas.

## R-11. Portal: botón, diálogo y estado de la conversación

- **Decisión**: componentes en `apps/web/src/componentes/orientacion/`:
  - `BotonPreguntanos`, flotante abajo a la derecha, de 44 px o más, que no tapa el pie de los
    formularios: deja un margen inferior al contenido;
  - `ChatOrientacion`: `<dialog>` modal con `aria-labelledby`, foco en el campo al abrir, Escape y
    botón "Cerrar", y foco de vuelta al botón al cerrar. A 360 px ocupa toda la pantalla; en
    escritorio es un panel de 400 px;
  - región `aria-live="polite"` para respuestas y errores;
  - contador de caracteres (500) y botón de enviar desactivado mientras espera.

  La conversación vive en el estado de `Diseno` (`Aplicacion.tsx`): sobrevive al navegar entre
  páginas públicas y se pierde al recargar (FR-017). Se muestra solo en las rutas públicas: no en
  `/admin*`, `/personal*`, `/perfil`, `/cambiar-clave` ni `/ingresar`. Los enlaces (`FICHA`,
  `ASISTENTE`, `CONSULTA`, `LICENCIAS`) se convierten en rutas internas con un mapa fijo; el texto
  se muestra como texto, con saltos de línea, nunca como HTML.
- **Motivo**: FR-001, FR-017, FR-026 y EQ-05. Mismo patrón de estado común que `AvisoNavegacion`.
- **Alternativas**:
  - una página `/orientacion`: pierde el contexto de la página en que estaba la persona;
  - un widget de terceros: enviaría datos fuera del sistema.

## R-12. Pruebas sin el proveedor real y evaluación EQ-08

- **Unitarias (Jest)**:
  - funciones del dominio: quitar datos personales, revisar cifras, seleccionar contexto, armar
    mensajes e interpretar la respuesta;
  - `ResponderPregunta`, con dobles de los puertos.
- **Adaptador**: probado contra un servidor HTTP local de prueba (`node:http` en un puerto libre)
  que simula respuesta correcta, 429, 401, 500, demora mayor al tiempo máximo (con un tiempo
  máximo de 200 ms en la prueba), JSON inválido y cuerpo vacío. Comprueba también que la cabecera
  `Authorization` lleva la clave ficticia y que ningún error la contiene.
- **Integración (Supertest)**: con `crearAplicacionDePrueba({ ajustar })` se reemplaza el token
  `PROVEEDOR_ORIENTACION` por un proveedor simulado que guarda lo que recibe. Comprueba:
  - que cumple el contrato y lleva `no-store`;
  - el 422, el 429 con `Retry-After` y la pregunta 11 sin llegar al proveedor;
  - los datos personales quitados y los registros sin datos (`LoggerCapturador`);
  - `NO_DISPONIBLE` sin clave.
- **Portal**: Jest y Testing Library con `simularApi`. E2E con Playwright a 360 px, sin
  proveedor: verifica `NO_DISPONIBLE` y la accesibilidad.
- **Evaluación EQ-08**, a pedido y fuera de CI:
  - `tests/orientacion/preguntas-prueba.json` tiene 30 o más preguntas con lo esperado (resultado,
    códigos de receta y cifras que deben aparecer);
  - `tests/orientacion/evaluar.mjs` las envía a la API levantada con la clave real, con
    `ORIENTACION_LIMITE_PREGUNTAS` alto solo en ese compose y una pausa entre preguntas para
    respetar la cuota, y escribe el informe en `docs/08-sprint-2/evidencias/orientacion-eq08.md`;
  - nunca se sube la clave: se lee de `infra/.env`.
- **Motivo**: pedido de la usuaria (nunca la clave real en pruebas) y principio V.

## R-13. Rendimiento y disponibilidad

- La pregunta no toca PostgreSQL. Lee el catálogo de la caché de Redis y la guía de memoria; el
  tiempo lo pone el proveedor.
- Con el proveedor caído, la respuesta llega en 15 s o menos, más lo que tarda el sistema (SC-005).
- Una falla del proveedor no lanza excepciones fuera del caso de uso. Las demás rutas no dependen
  del módulo (SC-006).
- k6: sin escenario nuevo. El límite por persona y la cuota del proveedor impiden una carga
  masiva real. Se agrega una prueba de humo en Postman (422 sin pregunta).
