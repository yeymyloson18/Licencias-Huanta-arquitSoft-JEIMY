---
description: 'Tareas para implementar el chatbot de orientación (012)'
---

# Tareas: Chatbot de orientación sobre licencias de funcionamiento

**Entrada**: documentos de `specs/012-chatbot-orientacion/`.

**Requisitos previos**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/) y [quickstart.md](quickstart.md).

**Pruebas**: obligatorias (constitución, principio V). En cada historia se escriben primero y deben
fallar antes de implementar. **Ninguna prueba usa la clave real ni llama al proveedor real**: se
usan un proveedor simulado y un servidor `node:http` local.

**Organización**: por historia de usuario, para implementar y probar cada una por separado.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes).
- **[US#]**: historia de usuario de `spec.md`.

## Rutas

- API: `apps/api/src/modulos/orientacion/` (módulo nuevo), pruebas en `apps/api/test/`.
- Portal: `apps/web/src/`.
- Contrato: `docs/06-contrato-api/openapi.yaml`. Tipos en `packages/contracts` (`npm run generar`).
- E2E: `tests/e2e/`. Evaluación EQ-08: `tests/orientacion/`.

---

## Fase 1: Preparación (enmienda, contrato y configuración)

**Propósito**: habilitar el módulo nuevo según la constitución, publicar el contrato primero y
declarar las variables sin ninguna clave.

- [X] T001 Enmendar la constitución a la versión **1.1.0** (MINOR) en `.specify/memory/constitution.md`
      (research R-01). **Aprobada por la usuaria el 2026-11-24** (análisis D1):
  - principio I: "**10 módulos**", agregando "Orientación";
  - "Restricciones tecnológicas y de alcance": sacar de "fuera de alcance" el chat de orientación
    del portal y dejar "el asistente por WhatsApp (Fase 2, RC13)";
  - informe de impacto (Sync Impact Report) al inicio y `Última enmienda: <fecha>`.

  Actualizar en el mismo cambio los documentos que nombran los 9 módulos:
  - `docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md`: sección del módulo
    10 "Orientación" (responsabilidad, puertos, fachada: ninguna, dependencias: `catalogo` por su
    fachada);
  - la línea del README que declara el alcance.
- [X] T002 Contrato primero en `docs/06-contrato-api/openapi.yaml`
      ([contracts/api-orientacion.md](contracts/api-orientacion.md)):
  - etiqueta `Orientación`;
  - `POST /orientacion/preguntas` (`operationId: preguntarOrientacion`, `security: []`);
  - cuerpo `PreguntaOrientacion` (`additionalProperties: false`; `pregunta` con "minLength: 1,
    maxLength: 500"; `historial` con "maxItems: 6" de `TurnoConversacion`, que tiene `rol` "enum:
    [PERSONA, ORIENTADOR]" y `texto` con "minLength: 1, maxLength: 1200");
  - respuesta 200 `RespuestaOrientacion` con la cabecera `Cache-Control`. Campos `resultado`
    "enum: [RESPONDIDA, SIN_INFORMACION, FUERA_DE_TEMA, CONSULTA_TRAMITE, NO_DISPONIBLE]", `texto`
    "maxLength: 1200", `enlaces` "maxItems: 4" de `EnlaceOrientacion` (`tipo` "enum: [FICHA,
    ASISTENTE, CONSULTA, LICENCIAS]", `codigoReceta` con `$ref CodigoReceta`), `aclaracion`
    string o null y `datoPersonalQuitado` booleano;
  - errores: 422 `NoProcesable`, 429 `DemasiadosIntentos` y 503 `ServicioNoDisponible`. Ampliar la
    descripción de esas dos respuestas comunes para mencionar la 012.

  Validar con `npm run contrato`: sin errores nuevos. Hoy hay 6 advertencias.
- [X] T003 Generar los tipos con `npm run generar` (`packages/contracts`) y actualizar
      `docs/06-contrato-api/README.md`: fila "Orientación (público)" en la matriz de permisos,
      `preguntarOrientacion` en la lista de operaciones y tabla de la 012.
- [X] T004 [P] **Prueba primero** en `apps/api/test/unit/compartido/configuracion.spec.ts`:
  - sin `ORIENTACION_*` → `orientacion.apiUrl = 'https://api.groq.com/openai/v1'`,
    `modelo = 'openai/gpt-oss-120b'`, `apiKey = null`, `tiempoMaximoMs = 15000`,
    `limitePreguntas = 10`, `formatoJson = true`, y la configuración carga sin error;
  - `ORIENTACION_TIEMPO_MAXIMO_MS` fuera de "entre 1000 y 60000" → error;
  - en `production`, con clave y URL `http://…` → `ErrorConfiguracion`, cuyo mensaje nombra
    `ORIENTACION_API_URL` y **no** contiene la clave ficticia;
  - ningún mensaje de error ni `JSON.stringify` del resumen de la configuración contiene la clave
    ficticia (`clave-ficticia-de-prueba-012`).
- [X] T005 Implementar las variables en `apps/api/src/compartido/infraestructura/configuracion.ts`
      (research R-09): `ORIENTACION_API_URL`, `ORIENTACION_MODELO`, `ORIENTACION_API_KEY` (una
      cadena vacía cuenta como ausente), `ORIENTACION_TIEMPO_MAXIMO_MS`,
      `ORIENTACION_LIMITE_PREGUNTAS` y `ORIENTACION_FORMATO_JSON`. Van en `Configuracion.orientacion`.
      La clave nunca va en ningún resumen ni registro. Depende de T004.
- [X] T006 [P] Declarar las variables **con valores vacíos por defecto y sin clave**:
  - `infra/docker-compose.yml` (servicio `api`): `ORIENTACION_API_URL: ${ORIENTACION_API_URL:-}`,
    `ORIENTACION_MODELO: ${ORIENTACION_MODELO:-}` y `ORIENTACION_API_KEY: ${ORIENTACION_API_KEY:-}`;
  - lo mismo en `infra/produccion/docker-compose.yml`;
  - `.env.example`: bloque "Funcionalidad 012" con las tres variables vacías y un comentario: la
    clave se pide en la consola del proveedor y va solo en `infra/.env`, que no se sube; sin
    clave, el chat queda desactivado. **No** tocar `infra/.env`.

**Punto de control**: el contrato es válido, los tipos están generados y la API arranca sin clave.

---

## Fase 2: Base (bloquea todas las historias)

**Propósito**: módulo, puertos, quitar datos personales, catálogo por la fachada, guía y adaptador
del proveedor. Sin esto ninguna historia puede responder.

**⚠️ IMPORTANTE**: `quitarDatosPersonales` está en esta fase porque **ninguna** llamada al
proveedor puede salir sin pasar por ella (principio VII), ni siquiera en el MVP.

- [X] T007 [P] Crear el dominio base en `apps/api/src/modulos/orientacion/dominio/`:
  - `puertos.ts`: `FuenteCatalogo.licenciasVigentes()`, `FuenteGuia.temas()`,
    `ProveedorOrientacion.responder(mensajes)` con `ResultadoProveedor` (`OK` con `contenido` |
    `TIEMPO_AGOTADO` | `CUOTA_AGOTADA` | `CLAVE_INVALIDA` | `FALLA` | `RESPUESTA_INVALIDA` |
    `NO_CONFIGURADO`), `LimitadorPreguntas.reservar(huella)` → `{ permitido, segundosRestantes }`
    y `Reloj`;
  - `respuesta-orientacion.ts`: `ResultadoOrientacion`, `Enlace` y `RespuestaOrientacion`
    (data-model.md), además de `Desenlace` para los registros;
  - `mensajes-orientacion.ts`: los textos fijos de `contracts/api-orientacion.md`
    (`SIN_INFORMACION`, `FUERA_DE_TEMA`, `CONSULTA_TRAMITE`, `NO_DISPONIBLE` y la aclaración).

  Sin importar NestJS, zod, ioredis ni `fetch`.
- [X] T008 [P] **Prueba primero**
      `apps/api/test/unit/modulos/orientacion/dominio/pregunta-orientacion.spec.ts`:
  - recorta espacios;
  - vacía o solo con espacios → error;
  - 501 caracteres → error, 500 → bien;
  - historial "Máximo 6 turnos"; un turno con `texto` "De 1 a 1,200 caracteres" o con un `rol`
    distinto de `PERSONA` u `ORIENTADOR` → error.

  Después, implementar `dominio/pregunta-orientacion.ts`.
- [X] T009 [P] **Prueba primero**
      `apps/api/test/unit/modulos/orientacion/dominio/quitar-datos-personales.spec.ts`
      (research R-07). Se reemplazan por `[dato personal]` y `quitados = true`:
  - correo `ana.perez@correo.pe`;
  - celular `987654321`, `987 654 321`, `987-654-321` y `+51 987654321`;
  - RUC `20123456789` y `10400000011`;
  - DNI `40000001`;
  - CE `001234567`.

  **Se conservan** (`quitados = false`):
  - `EXP-2026-000123`;
  - `120 m²`;
  - `2024`;
  - `S/ 177.10`;
  - `15 días hábiles`;
  - `LIC-02`.

  Debe respetar el orden (correo, celular, RUC, DNI y CE): `20123456789` queda como un solo
  reemplazo, no como DNI más resto. Después, implementar
  `dominio/quitar-datos-personales.ts` como función pura.
- [X] T010 [P] Fuente del catálogo por la fachada (research R-02):
  - prueba en `apps/api/test/unit/modulos/orientacion/infraestructura/fuente-catalogo-fachada.spec.ts`
    con una `FachadaCatalogo` doble: usa `listarRecetas({ tipo: 'LICENCIA' })` y
    `obtenerRecetaVigente(codigo)`, descarta los `null` y no llama a nada más;
  - implementar `apps/api/src/modulos/orientacion/infraestructura/fuente-catalogo-fachada.ts`,
    que importa **solo** `../../catalogo/fachada`.
- [X] T011 [P] Guía de preguntas frecuentes (research R-03):
  - prueba en `apps/api/test/unit/modulos/orientacion/infraestructura/guia-orientacion-archivo.spec.ts`:
    - el JSON real carga;
    - cada tema cumple `id` "`^[a-z0-9-]{3,40}$`, único", `titulo` "De 1 a 120 caracteres",
      `palabrasClave` "Entre 1 y 20 palabras" y `respuesta` "De 1 a 1,500 caracteres";
    - un JSON inválido lanza un error al construir;
  - crear `apps/api/src/modulos/orientacion/infraestructura/guia/guia-orientacion.json` con los
    temas de research R-03: rutas A, B y C; ITSE previa, posterior y dentro de 6 meses; pago
    presencial con esquela en caja; estados del expediente; presentar; subsanar; consultar;
    silencio positivo y aprobación automática; vigencia; y trámites no atendidos (transferencia,
    cambio de giro y duplicado). **Sin montos ni plazos inventados**: las cifras solo si están en
    el TUPA 2024 (`docs/fuentes/tupa-2024.pdf`) o en `docs/01-analisis-de-sistema/09-validacion-del-tupa.md`;
    si no, el tema remite a la ficha de cada licencia. Horarios y teléfonos solo si la
    Municipalidad los confirmó; si no, "consulte en Mesa de partes". El tema `tramites-no-atendidos`
    dice expresamente que la transferencia, el cambio de giro y el duplicado no se atienden en este
    sistema y que se consultan en la Municipalidad;
  - implementar `infraestructura/guia-orientacion-archivo.ts`, que valida con zod.
- [X] T012 [P] Adaptador del proveedor (research R-05 y
      [contracts/proveedor-ia.md](contracts/proveedor-ia.md)):
  - **prueba primero** en
    `apps/api/test/unit/modulos/orientacion/infraestructura/proveedor-ia-compatible-openai.spec.ts`,
    contra un servidor `node:http` local en un puerto libre y con un tiempo máximo de 200 ms en la
    prueba. Casos:
    - 200 válido → `OK` con `contenido`;
    - `POST /chat/completions` con `Authorization: Bearer clave-ficticia-de-prueba-012`, `model`,
      `temperature: 0.2`, `max_tokens: 600` y `response_format` solo si `formatoJson`;
    - 429 → `CUOTA_AGOTADA`;
    - 401 y 403 → `CLAVE_INVALIDA`;
    - 500 → `FALLA`;
    - conexión rechazada → `FALLA`;
    - demora de 500 ms → `TIEMPO_AGOTADO`;
    - sin `choices[0].message.content` o vacío → `RESPUESTA_INVALIDA`;
    - sin clave → `NO_CONFIGURADO` **sin** hacer ninguna petición.

    Comprueba también que ningún resultado ni mensaje de error contiene la clave ficticia;
  - implementar `apps/api/src/modulos/orientacion/infraestructura/proveedor-ia-compatible-openai.ts`
    con `fetch` nativo y `AbortSignal.timeout(tiempoMaximoMs)`, sin reintentos y **sin SDK**.
- [X] T013 Apoyo de pruebas `apps/api/test/apoyo/proveedor-orientacion-simulado.ts`: un
      `ProveedorOrientacion` que guarda los `mensajes` recibidos y devuelve una respuesta
      programable (OK con un JSON dado o cualquier falla), más el ayudante `conProveedorSimulado`
      para `crearAplicacionDePrueba({ ajustar })`, que reemplaza el token `PROVEEDOR_ORIENTACION`.
- [X] T014 Módulo y registro:
  - `apps/api/src/modulos/orientacion/orientacion.module.ts`: raíz de composición con los tokens
    `PROVEEDOR_ORIENTACION`, `FUENTE_CATALOGO`, `FUENTE_GUIA`, `LIMITADOR_PREGUNTAS` y
    `RELOJ_ORIENTACION`, usando `FachadaCatalogo`, `CONFIGURACION` y `REDIS_CLIENTE`. Sigue el
    patrón de `reportes.module.ts`;
  - importarlo en `apps/api/src/app.module.ts`;
  - comprobar `npm run regla-dependencia` sin violaciones: `orientacion` solo usa
    `catalogo/fachada.ts` y `compartido/`.

  **Estado al cierre de la fase 2**: el módulo registra la fuente del catálogo, la guía, el proveedor y
  el reloj. `LIMITADOR_PREGUNTAS` queda declarado en `tokens.ts` y se registra con su adaptador en US5
  (T046). El caso de uso y el controlador llegan con US1. `aplicacion/` y `presentacion/` tienen un
  `.gitkeep` hasta entonces, para que `estructura-modulos.spec.ts` (ahora con 10 módulos) pase en CI.

**Punto de control**: base lista. Las pruebas de T008 a T012 pasan, la API arranca sin clave y la
regla de dependencia está en verde.

---

## Fase 3: Historia de usuario 1 - Preguntar y recibir una respuesta confiable (Prioridad: P1) 🎯 MVP

**Objetivo**: "Pregúntanos" abre el chat; una pregunta sobre tasa, plazo o requisitos se responde
con los datos de la receta vigente y un enlace a su ficha.

**Prueba independiente**: con un proveedor simulado y el catálogo de demostración, preguntar por la
tasa y el plazo de una licencia. La respuesta trae exactamente esos valores y un enlace `FICHA`
a esa receta.

### Pruebas de la historia 1 ⚠️ (escribir primero; deben fallar)

- [X] T015 [P] [US1] `apps/api/test/unit/modulos/orientacion/dominio/seleccionar-contexto.spec.ts`
      (research R-04):
  - "¿cuánto cuesta la licencia para una bodega?" → `detalle` incluye la receta de bodega;
  - "¿cómo pago?" → `temas` incluye el tema de pago;
  - sin coincidencias → los temas `rutas`, `presentar` y `consultar`;
  - `licencias` siempre tiene todas las vigentes;
  - hasta 2 recetas en `detalle` y hasta 4 en `temas`;
  - `cifrasPermitidas` contiene la tasa normalizada (`177.10`), el plazo (`15 dias`) y la vigencia
    (`12 meses`) de **todas las licencias de la tabla** y de las recetas en detalle, además de las
    cifras de los temas elegidos;
  - se normaliza sin tildes ni mayúsculas ("BODEGA", "bódega").
- [X] T016 [P] [US1] `apps/api/test/unit/modulos/orientacion/dominio/interpretar-respuesta.spec.ts`:
  - un JSON válido `{tipo, texto, codigosReceta}` → `RespuestaModelo`;
  - el JSON dentro de un texto con palabras antes y después → se toma el primer objeto;
  - `tipo` desconocido, `texto` vacío, de más de "4,000 caracteres" o que no es JSON → inválida;
  - el `texto` se recorta a 1,200.
- [X] T017 [P] [US1] `apps/api/test/unit/modulos/orientacion/aplicacion/responder-pregunta.spec.ts`,
      camino principal, con dobles de los puertos:
  - el proveedor recibe un mensaje de sistema con las reglas de `contracts/proveedor-ia.md`, el
    CONTEXTO entre delimitadores y la conversación (historial y pregunta) **ya sin datos
    personales**;
  - `RESPONDIDA` con `codigosReceta: ['LIC-02']` vigente → `enlaces` `[{tipo:'FICHA',
    codigoReceta:'LIC-02'}]`;
  - un código que no es licencia vigente se descarta;
  - sin códigos → enlace `ASISTENTE`;
  - con un catálogo cambiado (otra tasa), el CONTEXTO lleva la tasa nueva (FR-012).
- [X] T018 [P] [US1] `apps/api/test/integracion/orientacion.e2e-spec.ts`, con
      `conProveedorSimulado`:
  - una pregunta sobre una receta de demostración → 200 que cumple el contrato
    (`esperarCumpleContrato('post', '/orientacion/preguntas', …)`), con `Cache-Control: no-store`;
  - `resultado: RESPONDIDA` y el enlace `FICHA` de la receta;
  - el proveedor simulado recibió la tasa real de esa receta en el CONTEXTO;
  - un historial de 2 turnos llega al proveedor en orden (FR-013).
- [X] T019 [P] [US1] Portal: **pruebas primero**.
  - `apps/web/src/componentes/orientacion/ChatOrientacion.test.tsx`:
    - saludo de FR-002 y 3 preguntas de ejemplo que se pueden pulsar;
    - escribir y enviar → "Preparando la respuesta…" y luego la respuesta con el enlace "Ver la
      ficha de …" a `/licencias/LIC-02`;
    - el texto con `<b>` se muestra literal, no como HTML;
    - una pregunta de seguimiento envía el historial (como máximo los últimos 6 turnos);
  - `BotonPreguntanos.test.tsx`: abre el chat; al cerrar y abrir, la conversación sigue.

  Usar `simularApi` con `POST /orientacion/preguntas`.

### Implementación de la historia 1

- [X] T020 [US1] Implementar en `apps/api/src/modulos/orientacion/dominio/`:
  - `seleccionar-contexto.ts`, puro;
  - `interpretar-respuesta.ts`, que valida sin zod: el dominio no importa paquetes externos. Se
    usan comprobaciones de tipos propias;
  - el armado de mensajes en `mensajes-orientacion.ts` (`armarMensajes(contexto, conversación)`).

  Deben pasar T015 y T016.
- [X] T021 [US1] Implementar `apps/api/src/modulos/orientacion/aplicacion/responder-pregunta.ts`
      (`ResponderPregunta.ejecutar({ pregunta, historial, huella })`):
  1. `PreguntaOrientacion`;
  2. `quitarDatosPersonales` sobre la pregunta y cada turno;
  3. catálogo y guía;
  4. `seleccionarContexto`;
  5. `armarMensajes`;
  6. proveedor;
  7. `interpretarRespuesta`;
  8. enlaces armados por el sistema.

  Devuelve `RespuestaOrientacion` más `desenlace` y `duracionMs`. El límite se agrega en US5 y la
  revisión de cifras en US2. Debe pasar T017.
- [X] T022 [US1] Presentación:
  - `apps/api/src/modulos/orientacion/presentacion/esquemas-orientacion.ts`: zod del cuerpo, igual
    al contrato (`.strict()`). Un error de validación → `ErrorProblema` 422 **sin** repetir el
    texto;
  - `presentacion/orientacion.controller.ts`: `@Controller('orientacion')`, `@Post('preguntas')`,
    `@HttpCode(200)` y `@Header('Cache-Control','no-store')`. Calcula la huella (US5) y registra
    con el `Logger` de NestJS **solo** `resultado`, `desenlace`, `duracionMs`, `modelo` y
    `datoPersonalQuitado`.

  Debe pasar T018.
- [X] T023 [P] [US1] Portal, cliente: en `apps/web/src/servicios/clienteApi.ts`, `export type
      RespuestaOrientacion` (de `@licencias/contracts`) y `preguntarOrientacion(pregunta,
      historial)`, que devuelve `{tipo:'ok',datos}` | `{tipo:'limite',segundos}` |
      `{tipo:'no-disponible'}`. No envía el token del personal.
- [X] T024 [US1] Portal, componentes en `apps/web/src/componentes/orientacion/`:
  - `enlacesOrientacion.ts`: mapa fijo `FICHA` → `/licencias/<codigo>`, `ASISTENTE` →
    `/asistente`, `CONSULTA` → `/consulta` y `LICENCIAS` → `/`;
  - `ChatOrientacion.tsx`: saludo, ejemplos, lista de mensajes, `<textarea>` "Escriba su pregunta"
    con `maxLength={500}`, "Enviar", texto plano con saltos de línea y aclaración;
  - `BotonPreguntanos.tsx`.

  La conversación se guarda en el estado de `Diseno` en `apps/web/src/Aplicacion.tsx`, sin
  `localStorage`. Se monta **ya filtrado** por las rutas públicas (`contracts/portal-orientacion.md`),
  así nunca aparece en las pantallas del personal; US6 agrega su prueba (T050). Deben pasar T019.

**Punto de control**: US1 funciona con el proveedor simulado (integración y portal) y con el real
en la prueba manual de `quickstart.md`.

**Estado al cierre de la fase 3**: integración (11) y portal en verde con el proveedor simulado. La
prueba manual con el proveedor real queda para después de US3 (sin la clave real antes). Notas:

- la huella del límite no entra todavía al caso de uso; se agrega con US5 (T047);
- las cifras se extraen en `dominio/cifras.ts`, que también usará la revisión de US2;
- en el portal ya se reutiliza `clientePublico` (sin la sesión del personal) y el chat se monta
  filtrado por rutas públicas (T024).

---

## Fase 4: Historia de usuario 2 - Nunca recibir datos inventados (Prioridad: P1)

**Objetivo**: ninguna tasa, plazo ni requisito fuera del catálogo o de la guía llega al
administrado. Si la información no está, responde "No tengo esa información" y orienta a la
Municipalidad.

**Prueba independiente**: un proveedor simulado devuelve una tasa que no existe. El sistema
muestra la respuesta de `SIN_INFORMACION`, no la del proveedor.

### Pruebas de la historia 2 ⚠️

- [X] T025 [P] [US2] `apps/api/test/unit/modulos/orientacion/dominio/revisar-cifras.spec.ts`
      (research R-06):
  - detecta `S/ 123.45`, `S/. 123`, `S/123`, `123.45 soles`, `15 días`, `15 días hábiles`,
    `30 días calendario` y `12 meses`;
  - cifras del contexto → aprobada; una cifra ajena → rechazada;
  - `S/ 177.1` equivale a `177.10`;
  - un texto sin cifras → aprobado;
  - números que no son montos ni plazos ("LIC-02", "2024", "paso 3") → no cuentan.
- [X] T026 [P] [US2] Ampliar `responder-pregunta.spec.ts`:
  - el modelo responde una cifra ajena → `resultado SIN_INFORMACION`, el texto fijo, el enlace
    `LICENCIAS` y `desenlace RECHAZADA_POR_REVISION`;
  - el modelo responde `SIN_INFORMACION` → el texto fijo del sistema, no el del modelo;
  - `aclaracion` solo con `RESPONDIDA` (FR-008) y `null` en los demás casos;
  - una pregunta por "transferencia de licencia" lleva al CONTEXTO el tema `tramites-no-atendidos`;
    si el modelo responde `RESPONDIDA` con ese texto (sin cifras), pasa la revisión y se muestra con
    el enlace `LICENCIAS`; si responde `SIN_INFORMACION`, se usa el texto fijo.
- [X] T027 [P] [US2] Ampliar `apps/api/test/integracion/orientacion.e2e-spec.ts`: con un proveedor
      simulado que responde "La tasa es S/ 999.99", la respuesta HTTP **no** contiene `999.99` y
      tiene `resultado: SIN_INFORMACION`.
- [X] T028 [P] [US2] Ampliar `ChatOrientacion.test.tsx`: con `aclaracion`, se ve "Esta es una
      orientación…"; con `SIN_INFORMACION`, se ve el texto y el enlace "Ver la lista de licencias".

### Implementación de la historia 2

- [X] T029 [US2] Implementar `apps/api/src/modulos/orientacion/dominio/revisar-cifras.ts`, puro, e
      integrarlo en `ResponderPregunta` después de `interpretarRespuesta`. Usar los textos fijos y
      la aclaración de `mensajes-orientacion.ts`. Deben pasar T025 a T027.
- [X] T030 [US2] Portal: mostrar `aclaracion` en letra secundaria debajo de la respuesta, en
      `ChatOrientacion.tsx`, con su estilo en `apps/web/src/estilos/global.css`. Debe pasar T028.

**Punto de control**: US1 y US2 en verde; ninguna cifra ajena llega al portal.

---

## Fase 5: Historia de usuario 3 - Mis datos personales no salen del sistema (Prioridad: P1)

**Objetivo**: DNI, RUC, celular, CE y correo nunca llegan al proveedor ni a los registros. Una
pregunta sobre un trámite concreto remite a "Consultar mi trámite". Si escribió un dato personal,
se le avisa.

**Prueba independiente**: con un proveedor simulado que guarda lo que recibe, una pregunta con
datos ficticios no los entrega al proveedor y los registros capturados no los contienen.

### Pruebas de la historia 3 ⚠️

- [X] T031 [P] [US3] Caso `privacidad-012` en `apps/api/test/integracion/datos-personales.e2e-spec.ts`
      (primero `limpiarClavesSeguridad(redis)`). La pregunta es "mi DNI es 40000001, RUC
      20123456789, cel 987 654 321, correo ana.perez@correo.pe, ¿cómo va mi trámite?", con un
      historial que también tiene datos. Comprobar:
  - (a) los `mensajes` del proveedor simulado no contienen ninguno de esos datos y sí
    `[dato personal]`;
  - (b) la respuesta tiene `datoPersonalQuitado: true` y no repite los datos;
  - (c) ninguna línea de `LoggerCapturador` contiene los datos, el texto de la pregunta, `127.0.0.1`
    ni la clave ficticia;
  - (d) `redis.keys('lim:orientacion:*')` no contiene la IP.
- [X] T032 [P] [US3] Ampliar `responder-pregunta.spec.ts`:
  - el modelo responde `CONSULTA_TRAMITE` → texto fijo y enlace `CONSULTA`;
  - una pregunta con `EXP-2026-000123` llega al proveedor con el número (no es un dato personal),
    pero la respuesta nunca trae datos de expedientes: el caso de uso no tiene ningún puerto de
    trámites.
- [X] T033 [P] [US3] Ampliar `ChatOrientacion.test.tsx`:
  - con `datoPersonalQuitado: true` se ve "Por su seguridad, quitamos sus datos personales…";
  - con `CONSULTA_TRAMITE`, el enlace "Consultar mi trámite" va a `/consulta`;
  - el saludo dice que no hace falta escribir el DNI, el RUC, el celular ni el correo.

### Implementación de la historia 3

- [X] T034 [US3] En `ResponderPregunta`, propagar `datoPersonalQuitado` (de la pregunta o de
      cualquier turno) y mapear `CONSULTA_TRAMITE`. Revisar `orientacion.controller.ts` y
      `compartido/presentacion/filtro-problema.ts`: ningún registro ni Problema incluye el cuerpo
      de la petición. Deben pasar T031 y T032.
- [X] T035 [US3] Portal: aviso de dato personal y enlace `CONSULTA` en `ChatOrientacion.tsx`. Debe
      pasar T033.

**Punto de control**: las tres historias P1 en verde. **El MVP se puede probar con la clave real
recién aquí.**

**Estado al cierre de la fase 5**: las pruebas de US3 de la API pasaron sin cambios de código, porque
quitar los datos personales (T009) y el mapeo de `CONSULTA_TRAMITE` (T021) ya estaban hechos. T034 fue
una revisión: el controlador registra solo resultado, desenlace, duración, modelo y
`datoPersonalQuitado`, y `FiltroProblema` no registra el cuerpo. La parte (d) de T031 (claves
`lim:orientacion:*` sin la IP) recién tiene claves que revisar cuando exista el límite (US5).

---

## Corrección de la 012: conversación real que falló (2026-11-24)

**Conversación**: "que es el tupa" → FUERA_DE_TEMA; "que documentos tengo que presentar" → "par ala
categoria mas basica" (la IA respondió LIC-01) → "cuales son esos documento requeridos" →
SIN_INFORMACION. Causa: `seleccionarContexto` solo miraba los turnos PERSONA y "basica" no coincidía
con "riesgo bajo", así que los requisitos de LIC-01 nunca llegaron al proveedor. Requisitos nuevos:
FR-027 a FR-030 de `spec.md`.

- [X] T062 [US1] **Pruebas primero** con esa conversación exacta (deben fallar):
  - `apps/api/test/unit/modulos/orientacion/dominio/seleccionar-contexto.spec.ts`:
    - "par ala categoria mas basica" → LIC-01 en `detalle`;
    - "cuales son esos documento requeridos" con la respuesta anterior del chat que nombró LIC-01
      (por `codigosReceta` y por `LIC-01` en el texto) → LIC-01 primero en `detalle`;
    - entre dos respuestas anteriores con LIC-02 y LIC-03, gana la más reciente (LIC-03), salvo que
      la pregunta actual nombre otra licencia;
    - "tienda", "abarrotes" → LIC-09; "papeles", "documentos" → `pideRequisitos`;
    - con la guía real, "que es el tupa" → tema principal `tupa`;
  - `apps/api/test/unit/modulos/orientacion/aplicacion/responder-pregunta.spec.ts`:
    - "que documentos tengo que presentar" sin licencia → pregunta por el tipo de negocio, enlace
      `ASISTENTE`, desenlace `PREGUNTA_TIPO_NEGOCIO` y **sin** llamar al proveedor;
    - la conversación completa: en el tercer paso el CONTEXTO lleva los requisitos de LIC-01;
    - las reglas dicen que el TUPA, la Municipalidad y este sistema son del tema;
  - `apps/api/test/integracion/orientacion.e2e-spec.ts`: la misma conversación contra el catálogo
    sembrado (los requisitos reales de LIC-01 llegan al proveedor simulado) y un turno ORIENTADOR con
    `codigosReceta` inválido → 422;
  - `apps/web/src/componentes/orientacion/ChatOrientacion.test.tsx`: el historial que envía el
    portal incluye los `codigosReceta` de los enlaces a fichas de cada respuesta.
- [X] T063 Contrato primero: `TurnoConversacion` admite `codigosReceta` opcional (`maxItems: 4`, items
      `CodigoReceta`; solo tiene sentido en turnos ORIENTADOR) en `docs/06-contrato-api/openapi.yaml`,
      `contracts/api-orientacion.md`; `npm run generar`; esquema zod en
      `presentacion/esquemas-orientacion.ts`.
- [X] T064 [US1] Dominio (FR-027 y FR-028): `dominio/sinonimos.ts` con el mapa de sinónimos en
      español sencillo, y `seleccionarContexto` con puntajes: un código en la pregunta actual (1000),
      palabras de la pregunta actual (300 + coincidencia), códigos de las respuestas anteriores del
      chat (100 + recencia; los de `codigosReceta` y los `LIC-xx` del texto) y palabras de los turnos
      PERSONA anteriores. Agrega `pideRequisitos` al contexto.
- [X] T065 [US1] Caso de uso (FR-029): si `pideRequisitos` y no hay licencia en `detalle`, responde
      el texto fijo que pregunta por el tipo de negocio (`RESPONDIDA`, enlace `ASISTENTE`, desenlace
      `PREGUNTA_TIPO_NEGOCIO`) sin llamar al proveedor.
- [X] T066 [US1] Guía y reglas (FR-030): tema `tupa` ("¿Qué es el TUPA?") en
      `infraestructura/guia/guia-orientacion.json`; regla nueva en `REGLAS_ORIENTACION`: el TUPA, la
      Municipalidad y este sistema son del tema; si piden requisitos sin licencia clara, preguntar el
      tipo de negocio. Portal: `historialDe` envía los `codigosReceta` de las fichas de cada respuesta.
- [X] T067 Conjunto EQ-08: crear `tests/orientacion/preguntas-prueba.json` con las 4 preguntas de esta
      conversación (con su historial y lo esperado). T057 lo completa hasta 30 o más.

**Estado**: las pruebas con la conversación exacta fallaron antes de corregir (2 unitarias de la guía,
los tipos nuevos y 4 de integración) y pasan después. Los sinónimos quedaron en un mapa del dominio
(`dominio/sinonimos.ts`), no en la guía, porque también sirven para elegir recetas.

---

## Fase 6: Historia de usuario 4 - El chat sigue siendo útil aunque el proveedor falle (Prioridad: P2)

**Objetivo**: ante tiempo agotado, error, cuota agotada, respuesta inválida o falta de clave, el
chat lo dice y ofrece el asistente y la lista de licencias. El resto del portal no se entera.

**Prueba independiente**: con el proveedor simulado en cada falla, y sin clave, la respuesta es
`NO_DISPONIBLE` con los enlaces `ASISTENTE` y `LICENCIAS`.

### Pruebas de la historia 4 ⚠️

- [X] T036 [P] [US4] Ampliar `responder-pregunta.spec.ts`: cada `ResultadoProveedor` de falla
      (`TIEMPO_AGOTADO`, `CUOTA_AGOTADA`, `CLAVE_INVALIDA`, `FALLA`, `RESPUESTA_INVALIDA` y
      `NO_CONFIGURADO`) → `resultado NO_DISPONIBLE`, el texto fijo, los enlaces `[ASISTENTE,
      LICENCIAS]` y el `desenlace` igual al tipo de falla. Una excepción inesperada del proveedor
      también termina en `NO_DISPONIBLE` (`FALLA`), sin propagarse.
  - si `FuenteCatalogo.licenciasVigentes()` lanza un error o devuelve `[]` → `resultado
    NO_DISPONIBLE` y `desenlace CATALOGO_NO_DISPONIBLE`, **sin** llamar al proveedor.
- [X] T037 [P] [US4] Ampliar `apps/api/test/integracion/orientacion.e2e-spec.ts`:
  - sin `ORIENTACION_API_KEY` (adaptador real, sin red) → 200 `NO_DISPONIBLE` según el contrato;
  - con el proveedor simulado en `CUOTA_AGOTADA` → `NO_DISPONIBLE`, y en la misma prueba `GET
    /catalogo/recetas` y `POST /asistente/proponer` responden igual (SC-006);
  - con el adaptador real, `ORIENTACION_API_URL` apuntando a un servidor `node:http` local que nunca
    responde y `ORIENTACION_TIEMPO_MAXIMO_MS=1000` → `NO_DISPONIBLE` en menos de 2 s. Es el mismo
    camino que en producción (15 s + 1 s, SC-005).
- [X] T038 [P] [US4] Ampliar `ChatOrientacion.test.tsx`:
  - `NO_DISPONIBLE` → texto y enlaces "¿Qué licencia necesito?" y "Ver la lista de licencias";
  - una ruta no simulada (404), un error de red o un 503 → el mismo mensaje y los mismos enlaces.

### Implementación de la historia 4

- [X] T039 [US4] En `ResponderPregunta`, mapear todas las fallas a `NO_DISPONIBLE` y capturar
      cualquier excepción del puerto, y capturar los errores de `FuenteCatalogo` antes de llamar al
      proveedor. El controlador registra un `warn` solo con el `desenlace`
      cuando es `CLAVE_INVALIDA` o `CUOTA_AGOTADA`. Deben pasar T036 y T037.
- [X] T040 [US4] Portal: en `clienteApi.ts` y `ChatOrientacion.tsx`, tratar el 503, el error de
      red y los errores inesperados como `no-disponible`, con los enlaces. Debe pasar T038.

**Punto de control**: con el proveedor caído o sin clave, el chat orienta al asistente y el resto
del sistema sigue igual.

---

## Fase 7: Historia de usuario 5 - Solo licencias de funcionamiento y sin abuso (Prioridad: P2)

**Objetivo**: responder "solo atiendo licencias" ante preguntas fuera del tema o de manipulación;
aplicar 10 preguntas cada 15 minutos por huella con sal (sin IP) y el máximo de 500 caracteres.

**Prueba independiente**: preguntas fuera del tema → `FUERA_DE_TEMA`. La pregunta 11 → 429 con
`Retry-After` y el proveedor recibió solo 10.

### Pruebas de la historia 5 ⚠️

- [X] T041 [P] [US5] `apps/api/test/unit/modulos/orientacion/infraestructura/limitador-preguntas-redis.spec.ts`
      (research R-08), con un doble propio de Redis (el proyecto no tiene `ioredis-mock` y no se
      agrega):
  - 10 reservas permitidas y la 11.ª no, con `segundosRestantes` > 0;
  - la clave es `lim:orientacion:<huella>` con vencimiento de 900 s (`EXPIRE … NX`);
  - si Redis falla → `ErrorLimitadorNoDisponible`, definido en `dominio/puertos.ts`.
- [X] T042 [P] [US5] Ampliar `responder-pregunta.spec.ts`:
  - el límite no permite → el resultado es `limite` con `segundosRestantes` y el proveedor **no**
    se llama;
  - el modelo responde `FUERA_DE_TEMA` → texto fijo y enlace `ASISTENTE`;
  - el mensaje de sistema contiene las reglas contra cambiar el tema;
  - la pregunta va en un mensaje `user`, nunca dentro del CONTEXTO.
- [X] T043 [P] [US5] `apps/api/test/integracion/limite-orientacion.e2e-spec.ts` (limpiar
      `lim:orientacion:*` antes):
  - 10 preguntas → 200;
  - la 11.ª → 429 `demasiadas-preguntas` según el contrato, con `Retry-After` entre 1 y 900;
  - el proveedor simulado recibió 10;
  - 422 con pregunta vacía, con solo espacios, con 501 caracteres, con un historial de 7 turnos y
    con una propiedad de más, y ninguna cuenta para el límite;
  - con Redis caído (cliente desconectado en la prueba) → 503 `orientacion-no-disponible`.
- [X] T044 [P] [US5] `apps/api/test/unit/modulos/orientacion/presentacion/huella.spec.ts`:
  - la huella es `hex(HMAC(…, 'orientacion:' + ip))` usando `ProtectorDatos`;
  - es distinta de `huellaOrigen` de la 009 para la misma IP;
  - no contiene la IP.
- [X] T045 [P] [US5] Ampliar `ChatOrientacion.test.tsx`:
  - un 429 con `Retry-After: 420` → "Vuelva a intentarlo en 7 minutos" y el enlace al asistente;
  - el contador "N de 500";
  - "Enviar" desactivado con una pregunta vacía y mientras espera;
  - Enter envía y Mayús + Enter hace un salto de línea;
  - `FUERA_DE_TEMA` → texto y enlace al asistente.

### Implementación de la historia 5

- [X] T046 [US5] Implementar
      `apps/api/src/modulos/orientacion/infraestructura/limitador-preguntas-redis.ts`, con el mismo
      algoritmo que `LimitadorIntentosRedis` de la 002 (`MULTI`, `INCR`, `EXPIRE NX` y `TTL`;
      ventana fija de 15 minutos; máximo `ORIENTACION_LIMITE_PREGUNTAS`). Debe pasar T041.
- [X] T047 [US5] Integrar el límite:
  - huella en `apps/api/src/modulos/orientacion/presentacion/huella-orientacion.ts`, usada por el
    controlador (`peticion.ip` con `trust proxy`, `ProtectorDatos.hmac('orientacion:' + ip)` en
    hexadecimal);
  - `ResponderPregunta` reserva antes del proveedor y después de validar;
  - `limite` → `ErrorProblema.demasiadosIntentos(segundos)` con el `type`
    `demasiadas-preguntas`, o una variante nueva `demasiadasPreguntas(segundos)` en
    `apps/api/src/compartido/presentacion/error-problema.ts`;
  - `ErrorLimitadorNoDisponible` → 503 `orientacion-no-disponible` (variante nueva en
    `error-problema.ts`);
  - mapear `FUERA_DE_TEMA`.

  Deben pasar T042 a T044.
- [X] T048 [US5] Portal: contador, envío con Enter, botón desactivado, mensaje del 429 en minutos
      (redondeado hacia arriba) y `FUERA_DE_TEMA`, en `ChatOrientacion.tsx` y `clienteApi.ts`.
      Debe pasar T045.

**Punto de control**: el límite protege la cuota y el chat no sale de su tema.

**Estado al cierre de la fase 7**: el límite superado se comunica con `ErrorLimitePreguntas` (el
controlador lo traduce a 429 `demasiadas-preguntas`) en lugar de un resultado `limite`. El tipo
de problema 429 es una variante nueva, `ErrorProblema.demasiadasPreguntas`. La prueba de Redis caído
reemplaza el limitador por uno que falla, para no desconectar el Redis compartido de la suite.

---

## Fase 8: Historia de usuario 6 - Desde el celular y con lector de pantalla (Prioridad: P2)

**Objetivo**: botón y chat accesibles a 360 px, con teclado y con lector de pantalla, solo en las
páginas públicas y sin tapar los botones de la página.

**Prueba independiente**: a 360×740, abrir, escribir, enviar, leer y cerrar solo con teclado, sin
desplazamiento horizontal.

### Pruebas de la historia 6 ⚠️

- [X] T049 [P] [US6] Ampliar `BotonPreguntanos.test.tsx` y `ChatOrientacion.test.tsx`:
  - el botón tiene `aria-haspopup="dialog"` y `aria-expanded`;
  - al abrir, el foco va al `<textarea>`;
  - Escape y "Cerrar" cierran y el foco vuelve a "Pregúntanos";
  - el diálogo tiene `aria-labelledby` con el título "Pregúntanos sobre licencias";
  - la respuesta y los errores se anuncian en una región `aria-live="polite"`;
  - seguir un enlace cierra el chat y conserva la conversación.
- [X] T050 [P] [US6] Crear `apps/web/src/componentes/orientacion/MontajeOrientacion.test.tsx`
      con `montarEn(ruta)` (la app completa, como `Inicio.test.tsx` de la 011):
  - "Pregúntanos" aparece en `/`, `/asistente`, `/licencias/LIC-01`, `/consulta` y
    `/tramite/identidad`;
  - **no** aparece en `/ingresar`, `/perfil`, `/cambiar-clave`, `/admin` ni `/personal/caja`.
- [X] T051 [P] [US6] `tests/e2e/orientacion.spec.ts` (Playwright, proyectos `celular` y
      `escritorio`; el compose de E2E **no** tiene clave):
  - en `/`, "Pregúntanos" → escribir → "Enviar" → mensaje de `NO_DISPONIBLE` → el enlace "¿Qué
    licencia necesito?" lleva a `/asistente`;
  - en `celular`, con el chat abierto,
    `document.documentElement.scrollWidth <= clientWidth`;
  - Escape cierra y el foco vuelve a "Pregúntanos";
  - "Pregúntanos" no aparece en `/ingresar`.

### Implementación de la historia 6

- [X] T052 [US6] Implementar la accesibilidad en `ChatOrientacion.tsx` y `BotonPreguntanos.tsx`:
  - `<dialog>` con `showModal()`, foco, Escape y regreso del foco;
  - región `aria-live`;
  - revisar que el filtro por rutas públicas de T024 cumpla T050 (`apps/web/src/Aplicacion.tsx`).

  Deben pasar T049 y T050.
- [X] T053 [US6] Estilos en `apps/web/src/estilos/global.css`:
  - botón flotante abajo a la derecha, de 44 px o más, con foco visible;
  - `.contenido` con `padding-bottom` para que no tape el último botón;
  - diálogo a pantalla completa a 360 px y panel de 400 px desde 640 px;
  - áreas táctiles de 44 px, contraste AA y sin desplazamiento horizontal.

  Debe pasar T051 en CI.
- [X] T054 [US6] Lighthouse móvil con el chat abierto: agregar `http://localhost:8080/` a la medida
      del flujo `E2E` de la 011 (`tests/e2e/lighthouserc.json`). Abrir el chat antes de medir: el
      `puppeteerScript` (o uno nuevo, `tests/e2e/apoyo/lighthouse-chat.cjs`) carga `/`, pulsa
      "Pregúntanos" y deja el diálogo abierto, con `disableStorageReset`. Si Lighthouse recarga la
      página y el chat se cierra, la medida de SC-007 queda **pendiente**: no se reemplaza por la de
      `/` sola, y la cubren las pruebas de accesibilidad de T049 y T051. Accesibilidad ≥ 0.9. El resultado se anota tal como salga en `docs/08-sprint-2/README.md`,
      o queda "pendiente de medir".

**Punto de control**: las seis historias completas.

**Estado al cierre de la fase 8**: pruebas del portal en verde. El E2E (T051) se corre en el flujo `E2E`
de GitHub Actions (no en local: el compose de desarrollo leería la clave real de `infra/.env`).
Lighthouse (T054) mide `/` con el botón; **la medida con el chat abierto (SC-007) queda pendiente**,
porque Lighthouse CI recarga la página y el chat se cierra. No se anotó ningún puntaje. El filtro
por rutas públicas ya estaba desde T024: T050 solo agregó su prueba. jsdom no implementa
`showModal`: el chat lo usa cuando existe y, si no, abre el `<dialog>` con el atributo `open`.

---

## Fase 9: Pulido, documentación y evaluación EQ-08

- [ ] T055 [P] **ADR-011** "Proveedor externo de IA para la orientación" en
      `docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md`: fila del resumen y sección
      completa (contexto, decisión, alternativas, consecuencias). Debe decir:
  - formato compatible con OpenAI, Groq y `openai/gpt-oss-120b` por defecto;
  - `fetch` sin SDK;
  - qué datos salen (solo la pregunta limpia y el contexto público) y cuáles nunca salen;
  - qué pasa si el proveedor falla o cambia sus condiciones;
  - cómo se cambia de proveedor (solo variables).

  Nota: se pidió "ADR-008", pero ese número ya es el de PostgreSQL con Patroni.
- [ ] T056 [P] **EQ-08** "Exactitud de la orientación" en
      `docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md`, con fuente, estímulo,
      entorno, respuesta y medida (SC-001 a SC-003 y SC-005), y su fila en la tabla resumen y en
      la tabla de herramientas (`tests/orientacion/evaluar.mjs`).
- [ ] T057 [P] Conjunto de preguntas de prueba `tests/orientacion/preguntas-prueba.json`: 30 o
      más preguntas, cada una con `pregunta`, `resultadoEsperado`, `codigosReceta` y
      `cifrasEsperadas` tomadas del catálogo de demostración. Deben cubrir:
  - las 9 licencias (tasa, plazo o requisitos);
  - el proceso (rutas A, B y C, ITSE, pago, estados, presentar, subsanar y consultar);
  - 3 o más preguntas sin información;
  - 4 o más preguntas fuera del tema y de manipulación;
  - 3 o más preguntas con datos personales ficticios;
  - 3 o más consultas de expediente.
- [ ] T058 Evaluador `tests/orientacion/evaluar.mjs` (Node, sin dependencias nuevas):
  - envía cada pregunta a `E2E_URL` o `http://localhost:8080/api/v1/orientacion/preguntas`, con
    una pausa configurable entre preguntas;
  - compara cada resultado con lo esperado;
  - escribe `docs/08-sprint-2/evidencias/orientacion-eq08.md` con una tabla por pregunta y los
    totales de SC-001, SC-002, SC-003 y SC-005 (p95);
  - nunca lee ni imprime la clave, porque la clave está solo en la API.

  Documentar en `tests/orientacion/README.md` que corre contra un compose **de pruebas** con
  `ORIENTACION_LIMITE_PREGUNTAS=1000`. Si se puede correr con la clave de la usuaria, anotar los
  resultados tal como salgan; si no, el informe queda "pendiente de medir", sin inventar. Anotar
  además una corrida con `ORIENTACION_API_URL` sin respuesta: el tiempo del mensaje de falla
  (≤ 16 s, SC-005).
- [ ] T059 [P] Documentación:
  - `README.md`: sección "Chat de orientación (funcionalidad 012)" con qué hace, sus límites, cómo
    configurar la clave en `infra/.env` y qué pasa sin clave;
  - `docs/04-modelo-c4/Nivel1-DiagramadeContextodelSistema.md` y
    `Nivel2-DiagramadeContenedores.md`: sistema externo "Proveedor de IA (compatible con OpenAI)";
  - `docs/03-diseno-de-software/diagrama-casos-de-uso.md`: CU32 "Preguntar al chat de
    orientación" (Administrado, HU01 y HU03, RF01 y RF02, 012) y el total de casos de uso;
  - `docs/08-sprint-2/README.md`: la 012 en la tabla de funcionalidades y una sección de evidencia.
- [ ] T060 [P] Postman: en `tests/postman/humo.postman_collection.json`, "Orientación sin pregunta
      (012)": `POST /orientacion/preguntas` con `{}` → 422. No llama al proveedor.
- [ ] T061 Puertas locales de `quickstart.md`: `npm run lint && npm run typecheck && npm run
      formato`, `npm run contrato`, `npm run regla-dependencia`, `npm run cobertura` (≥ 80 % en
      `dominio/` y `aplicacion/` de `orientacion`) y `npm test -w apps/web`. Integración con
      contenedores temporales de PostgreSQL y Redis (puertos 5433 y 6380), nunca el Redis de
      desarrollo. ZAP: se mide con el flujo "Calidad en producción" existente (el endpoint es
      público). Marcar las tareas con `[X]` y hacer el commit `chore(012): cierre`.

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Fase 1**:
  - T001 (enmienda) primero: sin ella no se crea el módulo;
  - T002 → T003 (los tipos dependen del contrato);
  - T004 → T005;
  - T006 en paralelo.
- **Fase 2**: depende de la fase 1. T007 a T012 en paralelo; T013 y T014 después. Bloquea todas
  las historias.
- **US1 (fase 3)**: depende de la fase 2.
- **US2 (fase 4)** y **US3 (fase 5)**: dependen de US1 (`ResponderPregunta` y `ChatOrientacion`).
  Entre ellas son independientes; si se hacen a la vez, se coordinan los cambios en
  `responder-pregunta.ts` y `ChatOrientacion.tsx`.
- **US4 (fase 6)**, **US5 (fase 7)** y **US6 (fase 8)**: dependen de US1. US6 conviene al final
  porque toca el montaje en `Aplicacion.tsx` y los estilos.
- **Pulido (fase 9)**: T055, T056, T057, T059 y T060 en paralelo cuando haya historias
  terminadas; T058 después de T057; T061 al final.

### Dentro de cada historia

- Pruebas primero, y deben fallar.
- API: dominio → aplicación → presentación.
- Portal: cliente → componentes → montaje.

### Oportunidades de paralelo

- Fase 1: T004 y T006 en paralelo con T002 y T003.
- Fase 2: T007, T008, T009, T010, T011 y T012 (archivos distintos).
- US1: las pruebas T015 a T019 en paralelo; T023 (cliente del portal) en paralelo con T020 a T022
  (API).
- US2 a US5: sus pruebas [P] en paralelo dentro de cada historia.
- Pulido: T055, T056, T057, T059 y T060.

---

## Ejemplo de paralelo: base (fase 2)

```bash
Tarea: "puertos.ts, respuesta-orientacion.ts y mensajes-orientacion.ts en orientacion/dominio/"
Tarea: "pregunta-orientacion.spec.ts + pregunta-orientacion.ts"
Tarea: "quitar-datos-personales.spec.ts + quitar-datos-personales.ts"
Tarea: "fuente-catalogo-fachada.spec.ts + fuente-catalogo-fachada.ts"
Tarea: "guia-orientacion.json + guia-orientacion-archivo.ts"
Tarea: "proveedor-ia-compatible-openai.spec.ts (servidor node:http) + adaptador"
```

## Ejemplo de paralelo: US1

```bash
Tarea: "seleccionar-contexto.spec.ts"
Tarea: "interpretar-respuesta.spec.ts"
Tarea: "responder-pregunta.spec.ts (camino principal)"
Tarea: "orientacion.e2e-spec.ts"
Tarea: "ChatOrientacion.test.tsx + BotonPreguntanos.test.tsx"
```

---

## Estrategia de implementación

### MVP: las historias P1 (US1, US2 y US3)

1. Fase 1 y fase 2. Desde la base, ninguna llamada al proveedor sale sin quitar los datos
   personales.
2. US1: chat con respuestas del catálogo. Se valida con el proveedor simulado.
3. US2: revisión de cifras, para que nunca se muestre un dato inventado.
4. US3: privacidad comprobada y remisión a "Consultar mi trámite".
5. **Detenerse y validar**: integración y portal en verde, y la prueba manual con la clave real de
   `quickstart.md`. **No usar la clave real antes de terminar US3.**

### Entrega incremental

1. Preparación y base: contrato, configuración sin clave y módulo aislado.
2. US1, US2 y US3: MVP confiable y privado.
3. US4: tolerancia a fallas del proveedor.
4. US5: tema acotado y límite por persona.
5. US6: accesibilidad completa y montaje solo en las páginas públicas.
6. Pulido: ADR-011, EQ-08, evaluación, documentación y puertas.

---

## Notas

- [P] = archivos distintos, sin dependencias pendientes.
- **Nunca** usar ni escribir la clave real en el código, en las pruebas, en `.env.example`, en CI ni
  en los registros. `infra/.env` no se lee ni se modifica, salvo para la evaluación EQ-08 a pedido.
- No hay migraciones: si una tarea parece necesitar una, revisar `data-model.md`.
- La integración, el E2E y Postman corren en GitHub Actions. En local, la integración corre con
  contenedores temporales (puertos 5433 y 6380), porque un PostgreSQL nativo ocupa el 5432.
- Nunca poner la pregunta, datos personales ni la IP en la URL, en `console.*` ni en los registros.
