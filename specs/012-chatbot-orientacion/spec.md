# Especificación de funcionalidad: Chatbot de orientación sobre licencias de funcionamiento

**Rama de la funcionalidad**: `012-chatbot-orientacion`

**Creada**: 2026-11-24

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Chatbot de orientación sobre licencias de funcionamiento. En
las páginas públicas, un botón 'Pregúntanos' abre un chat donde el administrado escribe cualquier
pregunta sobre el TUPA 2024 de Huanta y el trámite de licencias en este sistema (qué licencia
necesita, tasas, plazos, requisitos, rutas A/B/C, ITSE, pago presencial en caja, estados del
expediente, cómo presentar, subsanar o consultar). Las respuestas se basan SOLO en el catálogo de
recetas vigente y en una guía de preguntas frecuentes del sistema; nunca inventa tasas, plazos ni
requisitos; si no sabe, lo dice y orienta a la Municipalidad. Fuera del tema, responde amablemente
que solo atiende licencias de funcionamiento. No consulta expedientes concretos: para eso remite a
'Consultar mi trámite'. Antes de enviar la pregunta al proveedor de IA se quitan DNI, RUC, celulares
y correos (Ley 29733), y nada de eso se guarda en registros. El proveedor es un servicio externo con
formato compatible con OpenAI (por defecto Groq con el modelo openai/gpt-oss-120b, nivel gratuito),
configurable por las variables ORIENTACION_API_URL, ORIENTACION_MODELO y ORIENTACION_API_KEY (ya
existen en infra/.env, que no se sube a GitHub; la clave nunca va en el código, en .env.example ni
en los registros), siempre llamado desde el backend con tiempo máximo y sin exponer la clave. Si el
proveedor falla, no hay clave o se agota la cuota, el chat lo dice y ofrece el asistente '¿Qué
licencia necesito?'. Límite de preguntas por persona para evitar abuso. Accesible a 360 px. Debe
cumplir la constitución: contrato OpenAPI primero, módulo propio con Clean Architecture, adaptador
del proveedor en infraestructura, pruebas sin llamar al proveedor real, un ADR-008 para la
dependencia externa y un escenario de calidad con un conjunto de preguntas de prueba y su respuesta
esperada."

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Preguntar sobre mi licencia y recibir una respuesta confiable (Prioridad: P1)

Un administrado (por ejemplo, la dueña de una bodega) entra al portal desde su celular, pulsa
"Pregúntanos" y escribe con sus palabras: "¿Cuánto cuesta la licencia para una bodega y cuánto
demora?". El chat responde en lenguaje sencillo con la licencia que le corresponde, su tasa, su
plazo y sus requisitos, tal como figuran en el catálogo vigente. La respuesta incluye un enlace a
la ficha de esa licencia y aclara que es una orientación.

**Por qué esta prioridad**: es el valor central: resolver dudas del TUPA sin ir a la Municipalidad
ni leer el documento completo, con datos que coinciden con el catálogo oficial.

**Prueba independiente**: con un proveedor simulado y el catálogo de demostración, preguntar por la
tasa y el plazo de una licencia y comprobar que la respuesta contiene exactamente la tasa y el plazo
de esa receta, y un enlace a su ficha.

**Escenarios de aceptación**:

1. **Dado** que el administrado está en una página pública, **cuando** pulsa "Pregúntanos",
   **entonces** se abre el chat con un saludo que explica qué puede preguntar (licencias de
   funcionamiento del TUPA 2024 de Huanta) y un campo para escribir.
2. **Dado** el chat abierto, **cuando** pregunta por la tasa, el plazo o los requisitos de una
   licencia, **entonces** la respuesta usa los valores de la receta vigente del catálogo, nombra la
   licencia e incluye un enlace a su ficha.
3. **Dado** el chat abierto, **cuando** describe su negocio ("vendo abarrotes en mi casa, ¿qué
   licencia necesito?"), **entonces** la respuesta orienta hacia la licencia que corresponde según
   el catálogo y ofrece el asistente "¿Qué licencia necesito?" para confirmarlo.
4. **Dado** el chat abierto, **cuando** pregunta por el proceso (rutas A, B y C, ITSE, pago
   presencial en caja, estados del expediente, cómo presentar, subsanar o consultar), **entonces**
   la respuesta se basa en la guía de preguntas frecuentes del sistema.
5. **Dado** que la Municipalidad cambió la tasa de una receta en el catálogo, **cuando** alguien
   pregunta por esa tasa, **entonces** el chat responde con la tasa nueva, sin cambios de código.
6. **Dado** una conversación en curso, **cuando** hace una pregunta de seguimiento ("¿y si además
   vendo licor?"), **entonces** la respuesta tiene en cuenta las preguntas anteriores de esa misma
   conversación.
7. **Dado** la conversación real que falló el 2026-11-24 (corrección de la 012): "que es el tupa",
   "que documentos tengo que presentar", "par ala categoria mas basica" y "cuales son esos documento
   requeridos", **entonces**:
   - "que es el tupa" se responde como parte del tema (no es FUERA_DE_TEMA);
   - "que documentos tengo que presentar", sin una licencia identificada, responde preguntando para
     qué tipo de negocio es;
   - "par ala categoria mas basica" se entiende como la licencia de riesgo bajo (LIC-01);
   - "cuales son esos documento requeridos" usa la licencia de la respuesta anterior del chat
     (LIC-01) y sus requisitos llegan al proveedor, en lugar de terminar en SIN_INFORMACION.
8. **Dado** el chat abierto, **cuando** envía una pregunta, **entonces** ve que la respuesta se
   está preparando y, al llegar, se anuncia a los lectores de pantalla.

---

### Historia de usuario 2 - Nunca recibir datos inventados (Prioridad: P1)

Si la respuesta no está en el catálogo ni en la guía, el chat lo dice con claridad y orienta a la
Municipalidad (Mesa de partes o la oficina encargada) en lugar de adivinar. Ninguna tasa, plazo o
requisito aparece en una respuesta si no está en el catálogo vigente.

**Por qué esta prioridad**: una tasa o un plazo inventado puede hacer que una persona pague mal o
pierda un plazo; la confianza en el sistema depende de esto.

**Prueba independiente**: con un proveedor simulado que devuelve una tasa que no existe en el
catálogo, comprobar que el sistema no muestra esa respuesta y muestra en su lugar el mensaje de "no
tengo esa información", con la orientación a la Municipalidad.

**Escenarios de aceptación**:

1. **Dado** una pregunta sobre un tema del trámite que no está en el catálogo ni en la guía,
   **cuando** se responde, **entonces** el chat dice que no tiene esa información y orienta a la
   Municipalidad, sin dar cifras.
2. **Dado** una respuesta del proveedor que contiene un monto o un plazo que no existe en el
   catálogo ni en la guía, **cuando** el sistema la revisa, **entonces** no la muestra y muestra la
   respuesta de "no tengo esa información".
3. **Dado** una pregunta sobre una licencia o un trámite que no está en el catálogo (por ejemplo,
   transferencia de licencia o cambio de giro), **cuando** se responde, **entonces** el chat dice
   que ese trámite no se atiende en este sistema y orienta a la Municipalidad.
4. **Dado** cualquier respuesta con datos del TUPA, **cuando** se muestra, **entonces** lleva la
   aclaración de que es una orientación y que lo oficial es la ficha de la licencia y la
   Municipalidad.

---

### Historia de usuario 3 - Mis datos personales no salen del sistema (Prioridad: P1)

Si el administrado escribe por descuido su DNI, RUC, celular o correo ("mi DNI es 40000001, ¿cómo
va mi trámite?"), esos datos se quitan antes de enviar la pregunta al proveedor externo y no quedan
en ningún registro. Si pregunta por su expediente, el chat no lo consulta: le explica que para eso
está "Consultar mi trámite" y le da el enlace.

**Por qué esta prioridad**: la Ley N.° 29733 y la constitución (principio VII) prohíben que los
datos personales salgan a un tercero o queden en los registros.

**Prueba independiente**: enviar una pregunta con un DNI, un RUC, un celular y un correo
ficticios a un proveedor simulado que guarda lo que recibe, y comprobar que no recibió ninguno de
esos datos y que los registros capturados tampoco los contienen.

**Escenarios de aceptación**:

1. **Dado** una pregunta con un DNI (8 dígitos), un RUC (11 dígitos), un celular (9 dígitos que
   empiezan con 9) o un correo, **cuando** se envía, **entonces** el proveedor recibe la pregunta
   con esos datos reemplazados por una marca neutra (por ejemplo, "[dato personal]").
2. **Dado** esa misma pregunta, **cuando** se revisan los registros del sistema, **entonces** no
   aparecen el DNI, el RUC, el celular, el correo ni el texto de la pregunta.
3. **Dado** que el administrado pregunta por el estado de su expediente o de su pago, **cuando** se
   responde, **entonces** el chat no muestra datos de ningún expediente y ofrece el enlace a
   "Consultar mi trámite".
4. **Dado** que el administrado escribió un dato personal, **cuando** recibe la respuesta,
   **entonces** ve un aviso breve de que no hace falta escribir sus datos personales en el chat.

---

### Historia de usuario 4 - El chat sigue siendo útil aunque el proveedor falle (Prioridad: P2)

Si el proveedor no responde a tiempo, falla, se agotó su cuota gratuita o no está configurado, el
chat lo dice con un mensaje claro y ofrece el asistente "¿Qué licencia necesito?" y la lista de
licencias, que no dependen del proveedor. El resto del portal sigue funcionando igual.

**Por qué esta prioridad**: el proveedor es externo y gratuito; su falla no debe dejar sin
orientación al administrado ni afectar el trámite.

**Prueba independiente**: con un proveedor simulado que tarda más que el tiempo máximo, que
responde con error o con "cuota agotada", y sin clave configurada, comprobar en cada caso el mensaje
del chat y el enlace al asistente.

**Escenarios de aceptación**:

1. **Dado** que el proveedor no responde dentro del tiempo máximo, **cuando** el administrado
   pregunta, **entonces** el chat dice que no pudo responder en este momento y ofrece "¿Qué licencia
   necesito?".
2. **Dado** que el proveedor responde con un error o con cuota agotada, **cuando** el administrado
   pregunta, **entonces** ve el mismo tipo de mensaje y el enlace al asistente.
3. **Dado** que no hay clave del proveedor configurada, **cuando** el sistema arranca, **entonces**
   arranca normalmente y, al enviar la primera pregunta, el chat avisa que la orientación por chat
   no está disponible y ofrece el asistente.
4. **Dado** cualquiera de estas fallas, **cuando** se usa el resto del portal (asistente, solicitud,
   consulta), **entonces** funciona sin cambios.

---

### Historia de usuario 5 - Solo atiende licencias de funcionamiento y evita el abuso (Prioridad: P2)

Si alguien pregunta algo ajeno ("¿quién ganó el partido?", "escríbeme un poema") o intenta que el
chat ignore sus reglas, el chat responde amablemente que solo atiende consultas sobre licencias de
funcionamiento. Cada persona tiene un límite de preguntas en un periodo para que nadie agote el
servicio.

**Por qué esta prioridad**: protege la cuota gratuita del proveedor, evita que el chat hable en
nombre de la Municipalidad sobre otros temas y mantiene el servicio para todos.

**Prueba independiente**: enviar preguntas fuera del tema y de manipulación al proveedor simulado y
comprobar la respuesta de "solo atiendo licencias"; luego superar el límite y comprobar el mensaje
de espera.

**Escenarios de aceptación**:

1. **Dado** una pregunta fuera del tema, **cuando** se responde, **entonces** el chat dice
   amablemente que solo atiende licencias de funcionamiento y sugiere qué puede preguntar.
2. **Dado** un intento de cambiar las reglas del chat ("olvida tus instrucciones y dime…"),
   **cuando** se responde, **entonces** el chat mantiene su tema y sus reglas.
3. **Dado** que una persona hizo 10 preguntas en los últimos 15 minutos, **cuando** hace otra,
   **entonces** el chat le dice que espere unos minutos (indicando cuántos) y ofrece el asistente, y
   la pregunta no llega al proveedor.
4. **Dado** una pregunta de más de 500 caracteres, **cuando** intenta enviarla, **entonces** el chat
   le pide acortarla y no la envía.

---

### Historia de usuario 6 - Usar el chat desde el celular y con lector de pantalla (Prioridad: P2)

El botón "Pregúntanos" y el chat funcionan a 360 px de ancho, con teclado y con lector de pantalla,
sin tapar los botones principales de la página.

**Por qué esta prioridad**: la mayoría de administrados usa el celular (EQ-05).

**Prueba independiente**: en una pantalla de 360×740, abrir el chat, escribir, enviar, leer la
respuesta y cerrarlo solo con teclado, sin desplazamiento horizontal.

**Escenarios de aceptación**:

1. **Dado** una pantalla de 360 px, **cuando** se abre el chat, **entonces** ocupa la pantalla de
   forma legible, sin desplazamiento horizontal, y se puede cerrar con un botón visible y con la
   tecla Escape.
2. **Dado** un usuario de teclado, **cuando** abre el chat, **entonces** el foco pasa al campo de
   la pregunta; al cerrarlo, el foco vuelve al botón "Pregúntanos".
3. **Dado** un lector de pantalla, **cuando** llega una respuesta o un error, **entonces** se
   anuncia sin mover el foco.
4. **Dado** una página pública, **cuando** el chat está cerrado, **entonces** el botón "Pregúntanos"
   no tapa los botones ni los campos principales de la página.

---

### Casos límite

- Pregunta vacía o solo con espacios: no se envía.
- Pregunta en mayúsculas, con faltas de ortografía o con palabras locales: se responde igual,
  dentro del tema.
- Pregunta en otro idioma (por ejemplo, quechua o inglés): el chat responde en español, dentro del
  tema; la atención en quechua queda fuera de esta funcionalidad.
- Un número de expediente (EXP-2026-000123) no es un dato personal y no se quita, pero el chat no lo
  consulta y remite a "Consultar mi trámite".
- Números que se parecen a un DNI o celular pero son parte de la pregunta (por ejemplo, un área de
  "120 m²" o un año): solo se quitan las secuencias con la forma de DNI, RUC, celular o correo.
- Catálogo sin recetas vigentes o no disponible: el chat dice que no puede orientar en este momento
  y orienta a la Municipalidad.
- La persona cierra el chat y lo vuelve a abrir en la misma página: ve su conversación; al recargar
  o salir del portal, la conversación se pierde (no se guarda).
- Varias preguntas seguidas antes de recibir respuesta: se envía una a la vez; el botón de enviar
  queda desactivado mientras se prepara la respuesta.
- Una persona del personal con sesión: el chat es para el administrado y no aparece en las
  pantallas del personal; en las páginas públicas sigue disponible para cualquiera.
- La respuesta del proveedor llega vacía, cortada o con formato raro: se trata como falla del
  proveedor.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Acceso al chat**

- **FR-001**: Todas las páginas públicas del portal DEBEN mostrar un botón "Pregúntanos" que abre el
  chat. Las pantallas del personal no lo muestran.
- **FR-002**: El chat DEBE abrir con un saludo que explique su alcance (licencias de funcionamiento
  del TUPA 2024 de Huanta), que es una orientación y que no hace falta escribir datos personales, y
  DEBE ofrecer 3 o 4 preguntas de ejemplo que se pueden pulsar.
- **FR-003**: El chat NO DEBE pedir iniciar sesión ni verificar identidad.

**Contenido de las respuestas**

- **FR-004**: Las respuestas DEBEN basarse solo en (a) las recetas vigentes del catálogo (nombre,
  requisitos, tasa, plazo, calificación, ruta y orden del ITSE) y (b) la guía de preguntas
  frecuentes del sistema. No DEBEN usar otras fuentes.
- **FR-005**: El sistema DEBE revisar cada respuesta antes de mostrarla: si contiene un monto o un
  plazo que no está en las recetas vigentes ni en la guía, NO DEBE mostrarla y DEBE mostrar en su
  lugar la respuesta de "no tengo esa información" (FR-006).
- **FR-006**: Cuando la información no está en el catálogo ni en la guía, el chat DEBE decirlo con
  claridad y orientar a la Municipalidad, sin dar cifras.
- **FR-007**: Cuando la respuesta trata de una licencia concreta, DEBE nombrarla como en el catálogo
  e incluir un enlace a su ficha. Cuando el administrado no sabe qué licencia necesita, DEBE ofrecer
  el asistente "¿Qué licencia necesito?".
- **FR-008**: Toda respuesta con datos del TUPA DEBE llevar la aclaración de que es una orientación
  y que lo oficial es la ficha de la licencia y la Municipalidad.
- **FR-009**: Ante una pregunta fuera del tema o un intento de cambiar sus reglas, el chat DEBE
  responder amablemente que solo atiende licencias de funcionamiento y sugerir qué se puede
  preguntar.
- **FR-010**: El chat NO DEBE consultar ni mostrar datos de expedientes, pagos, licencias emitidas o
  personas. Ante una pregunta sobre un trámite concreto DEBE remitir a "Consultar mi trámite" con
  su enlace.
- **FR-011**: Las respuestas DEBEN estar en español sencillo, sin términos técnicos innecesarios, y
  con un largo que se lea cómodo en un celular (120 palabras o menos; 1,200 caracteres como
  máximo).
- **FR-012**: Un cambio en una receta del catálogo DEBE reflejarse en las respuestas sin cambiar el
  código (EQ-06). La guía de preguntas frecuentes DEBE poder actualizarse sin cambiar el código del
  chat.
- **FR-013**: El chat DEBE tener en cuenta las preguntas y respuestas anteriores de la misma
  conversación (hasta las últimas 6) para entender preguntas de seguimiento.

**Datos personales (Ley N.° 29733)**

- **FR-014**: Antes de enviar la pregunta y las anteriores de la conversación al proveedor, el
  sistema DEBE reemplazar los DNI (8 dígitos), RUC (11 dígitos que empiezan con 10, 15, 17 o 20),
  celulares (9 dígitos que empiezan con 9, con o sin espacios, guiones o el prefijo +51), carnés de
  extranjería (9 dígitos) y correos por una marca neutra.
- **FR-015**: El texto de las preguntas y las respuestas NO DEBE guardarse en la base de datos ni
  aparecer en los registros, en los mensajes de error ni en la dirección (URL). Los registros solo
  pueden contener datos no personales: cuánto tardó, cómo terminó (respondida, sin información,
  fuera del tema, rechazada por la revisión, falla del proveedor, límite) y el modelo usado.
- **FR-016**: Si la pregunta contenía un dato personal, el chat DEBE mostrar un aviso breve de que
  no hace falta escribirlo.
- **FR-017**: La conversación DEBE vivir solo en la página abierta del administrado; al recargar o
  salir se pierde.

**Proveedor externo**

- **FR-018**: El proveedor de IA DEBE llamarse solo desde el backend; el portal nunca habla con él
  ni conoce su dirección o su clave.
- **FR-019**: La dirección, el modelo y la clave del proveedor DEBEN configurarse por variables de
  entorno (`ORIENTACION_API_URL`, `ORIENTACION_MODELO` y `ORIENTACION_API_KEY`). Por defecto, un
  proveedor con formato compatible con OpenAI (Groq) y el modelo `openai/gpt-oss-120b`. La clave NO
  DEBE aparecer en el código, en `.env.example`, en los registros, en las respuestas ni en los
  mensajes de error.
- **FR-020**: Cada llamada al proveedor DEBE tener un tiempo máximo de 15 segundos; si se supera, se
  trata como falla.
- **FR-021**: Cuando el proveedor falla, se agota su cuota, tarda demasiado, responde vacío, no hay
  clave configurada, o el catálogo no está disponible o no tiene licencias vigentes, el chat DEBE decirlo con un mensaje claro y ofrecer el asistente "¿Qué licencia
  necesito?" y la lista de licencias. El sistema DEBE arrancar y funcionar normalmente sin clave.
- **FR-022**: Cambiar de proveedor compatible o de modelo DEBE ser posible solo cambiando las
  variables de entorno.

**Límites y uso**

- **FR-023**: Cada persona (identificada sin datos personales, por una huella de su conexión) DEBE
  poder hacer como máximo 10 preguntas cada 15 minutos. Al superarlo, el chat DEBE decir cuántos
  minutos esperar y ofrecer el asistente; la pregunta no llega al proveedor.
- **FR-024**: Cada pregunta DEBE tener como máximo 500 caracteres; el chat lo indica antes de
  enviar.
- **FR-025**: El chat DEBE enviar una pregunta a la vez y mostrar que la respuesta se está
  preparando.

**Accesibilidad**

- **FR-026**: El botón y el chat DEBEN funcionar a 360 px sin desplazamiento horizontal, con
  teclado (foco al abrir y regreso al cerrar, Escape para cerrar) y con lector de pantalla
  (respuestas y errores anunciados), y con áreas táctiles de al menos 44 px.

**Corrección por una conversación real (2026-11-24)**

- **FR-027**: En una pregunta de seguimiento, el sistema DEBE tener en cuenta las licencias que el
  chat ya nombró en sus respuestas anteriores: los códigos de receta de esas respuestas (los que el
  portal recibió en sus enlaces a fichas) y los códigos `LIC-xx` escritos en su texto. La más
  reciente tiene prioridad, salvo que la pregunta actual nombre otra licencia.
- **FR-028**: El sistema DEBE entender sinónimos en español sencillo: "básica", "más simple",
  "pequeño negocio" → riesgo bajo; "documentos", "papeles", "requisitos" → requisitos; "tienda",
  "abarrotes" → bodega. También con faltas de ortografía comunes de espacios ("par ala").
- **FR-029**: Si la persona pide requisitos o documentos y no hay ninguna licencia identificada (ni
  en la pregunta ni en la conversación), el chat DEBE responder preguntando para qué tipo de negocio
  es (con el asistente "¿Qué licencia necesito?" como alternativa), en lugar de una respuesta vaga o
  de "no tengo esa información". Esta respuesta no necesita al proveedor.
- **FR-030**: Las preguntas sobre el TUPA, la Municipalidad Provincial de Huanta y este sistema de
  licencias DEBEN tratarse como parte del tema (no FUERA_DE_TEMA). La guía DEBE tener el tema "¿Qué
  es el TUPA?".

### Entidades clave

- **Pregunta de orientación**: el texto que escribe el administrado (máximo 500 caracteres), con
  las preguntas y respuestas anteriores de la conversación. Existe solo mientras se responde; no se
  guarda.
- **Respuesta de orientación**: el texto para el administrado, cómo terminó (respondida, sin
  información, fuera del tema, falla del proveedor o límite), los enlaces sugeridos (ficha de una
  licencia, asistente, "Consultar mi trámite") y si se quitó algún dato personal.
- **Guía de preguntas frecuentes**: temas del proceso (rutas A, B y C, ITSE, pago en caja, estados
  del expediente, presentar, subsanar y consultar), cada uno con su respuesta aprobada. Es la única
  fuente, junto con el catálogo, para las respuestas sobre el proceso.
- **Receta vigente** (del catálogo, 003): fuente de nombres, requisitos, tasas, plazos, calificación
  y ruta. El chat la lee y no la modifica.
- **Conjunto de preguntas de prueba**: preguntas con la respuesta esperada (licencia, tasa, plazo,
  "no tengo esa información", "fuera del tema" o "Consultar mi trámite"), usado para medir la
  calidad del chat.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: En el conjunto de preguntas de prueba (al menos 30 preguntas que cubren las 9
  licencias, el proceso, preguntas sin información, fuera del tema, datos personales y consulta de
  expedientes, más las 4 de la conversación real de FR-027 a FR-030), al menos el 90 % de las
  respuestas coincide con la respuesta esperada.
- **SC-002**: El 100 % de las tasas y plazos que aparecen en las respuestas del conjunto de prueba
  coincide con el catálogo vigente; ninguna respuesta mostrada tiene una cifra inventada.
- **SC-003**: El 100 % de las preguntas fuera del tema y de manipulación del conjunto recibe la
  respuesta de "solo atiendo licencias de funcionamiento".
- **SC-004**: El 100 % de los DNI, RUC, celulares y correos ficticios de las pruebas de privacidad
  (con un proveedor simulado que guarda lo que recibe) se quita antes de llegar al proveedor, y
  ninguno aparece en los registros.
- **SC-005**: El 95 % de las preguntas recibe respuesta en 10 segundos o menos con el proveedor
  funcionando; con el proveedor caído, el mensaje de falla aparece en 16 segundos o menos.
- **SC-006**: Con el proveedor caído o sin clave, el 100 % de los recorridos del asistente, la
  solicitud y la consulta sigue funcionando.
- **SC-007**: El chat obtiene al menos 90 de accesibilidad en Lighthouse móvil a 360 px y no tiene
  desplazamiento horizontal.
- **SC-008**: La pregunta número 11 de una misma persona en 15 minutos se rechaza sin llegar al
  proveedor.

## Escenarios de calidad afectados

- **EQ-04 (seguridad)**: datos personales quitados antes del proveedor y fuera de los registros;
  clave del proveedor nunca expuesta; límite por persona. Se comprueba con pruebas de privacidad
  con un proveedor simulado y el análisis de OWASP ZAP sobre la nueva ruta pública.
- **EQ-05 (usabilidad y accesibilidad)**: chat a 360 px, con teclado y con lector de pantalla; se
  comprueba con Lighthouse y pruebas de la interfaz.
- **EQ-06 (mantenibilidad)**: un cambio en el catálogo o en la guía cambia las respuestas sin
  programar; el chat es un módulo propio con su adaptador del proveedor, que respeta la regla de
  dependencia (dependency-cruiser).
- **EQ-03 (disponibilidad)**: una falla del proveedor no afecta al resto del sistema.
- **Escenario nuevo, EQ-08 (exactitud de la orientación)**: se agrega a
  `docs/01-analisis-de-sistema/08-escenarios-atributos-calidad.md`:
  - estímulo: el conjunto de preguntas de prueba con su respuesta esperada;
  - medida: SC-001 a SC-003 y SC-005 (SC-004 se comprueba en la prueba de privacidad de la
    integración continua);
  - herramienta: una evaluación automática a pedido contra el proveedor real, fuera de las pruebas
    de la integración continua, que usan un proveedor simulado.

## Dependencias

- **Enmienda de la constitución** (antes del plan): la constitución pone el "asistente por chat
  (Fase 2)" fuera del alcance y fija 9 módulos; agregar un módulo exige enmendarla. Esta
  funcionalidad necesita una enmienda MINOR (1.0.0 → 1.1.0) que agregue el módulo de orientación y
  saque de "fuera de alcance" el chat de orientación en el portal (el asistente por WhatsApp sigue en
  la Fase 2), con su registro en el README.
- **ADR de la dependencia externa**: ADR-008 ya existe (PostgreSQL con réplica síncrona y Patroni)
  y el último es ADR-010, así que la decisión del proveedor de IA se registra como **ADR-011** en
  `docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md`, salvo que se indique otra cosa.
- **Catálogo (003)**: el chat lee las recetas vigentes por su fachada pública.
- **Proveedor externo**: cuenta del nivel gratuito de Groq (o de otro proveedor compatible) con su
  clave en `infra/.env`, que no se sube al repositorio.

## Supuestos

- "Por persona" se entiende sin cuenta y sin datos personales: se usa una huella de la conexión,
  como en los demás límites del portal público. Varias personas detrás de la misma conexión
  comparten el límite.
- El límite de 10 preguntas cada 15 minutos y el máximo de 500 caracteres son valores iniciales
  razonables para proteger la cuota gratuita; pueden ajustarse por configuración.
- La guía de preguntas frecuentes la redacta el equipo a partir del TUPA 2024 y de cómo funciona
  este sistema, y la revisa la Municipalidad; se mantiene como contenido del sistema (sin pantalla
  de edición en esta funcionalidad).
- Actualizar la guía de preguntas frecuentes cambia un archivo de datos revisado en un PR y necesita
  un nuevo despliegue, pero no programación.
- Las respuestas no se guardan; por eso no hay historial ni estadísticas de preguntas. Solo se
  cuentan, sin texto, cuántas preguntas terminaron de cada forma.
- En producción se usa el mismo proveedor compatible, configurado por variables; si la
  Municipalidad no lo autoriza, el chat queda desactivado (sin clave) y el portal ofrece el asistente.
- El proveedor recibe solo la pregunta sin datos personales y los fragmentos del catálogo y de la
  guía necesarios para responder; nunca datos de expedientes ni de personas.
- El chat no reemplaza al asistente "¿Qué licencia necesito?": lo complementa y lo ofrece.
