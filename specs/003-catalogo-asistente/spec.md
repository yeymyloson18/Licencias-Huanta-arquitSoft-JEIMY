# Especificación de funcionalidad: Catálogo y Asistente de ruta

**Rama de la funcionalidad**: `003-catalogo-asistente`

**Creada**: 2026-11-18

**Estado**: Borrador

**Entrada**: Descripción de la usuaria: "Usa como entrada el archivo docs/sdd/003-catalogo-specify.md" (Funcionalidad 003: Catálogo y Asistente de ruta. Como administrado quiero responder tres preguntas sencillas desde mi celular, para saber qué licencia me corresponde, qué documentos presentar, cuánto pago y cuánto demora, antes de ir a la municipalidad. Como administrador quiero actualizar los requisitos, la tasa, el plazo, la calificación, el orden del ITSE y la vigencia de cada receta, para aplicar los cambios del TUPA sin programar.)

**Cubre**: HU01, HU03 y HU14; RF01, RF02, RF05 y RF21; casos de uso CU01, CU02 (detalle) y CU24;
escenarios de calidad EQ-01, EQ-05 y EQ-06; ADR-002 (motor único + catálogo de recetas). Issues de
GitHub #4, #6 y #17.

## Aclaraciones

### Sesión 2026-11-18

- P: ¿El administrador puede cambiar la calificación o el orden del ITSE aunque ya no cuadren con la
  ruta de la licencia? → R: No. La ruta no se edita desde el portal y el sistema rechaza toda
  combinación de calificación e ITSE que no corresponda a la ruta; un cambio de ruta se hace por
  migración (opción más simple que cumple la constitución: motor único con rutas como datos, sin
  flujos nuevos).
- P: ¿Qué pasa si el administrado no sabe qué nivel de riesgo tiene su actividad? → R: La tercera
  pregunta ofrece la opción "No lo sé". No hay regla que la use, así que, salvo que una respuesta
  anterior ya decida la licencia (bodega o corporativo), el asistente muestra el aviso de "no se pudo
  determinar" y sugiere acudir a la municipalidad (FR-006). Es solo un dato más del catálogo, sin
  programar; se descartó agregar textos de ayuda porque la matriz aún no está validada (duda N.° 2).
- P: ¿El administrador puede ver desde el portal el historial de cambios de una receta? → R: No en
  esta funcionalidad. Cada cambio solo se registra (FR-021); la consulta queda para el módulo de
  Reportes. El principio VII exige registrar, no consultar.
- P: ¿Qué hace el asistente si la regla que corresponde propone una receta desactivada? → R: El
  administrador sí puede desactivarla; el asistente muestra el aviso de "no se pudo determinar" y no
  prueba la siguiente regla, para no orientar hacia una licencia que no corresponde (FR-006).
- P: Si dos administradores editan la misma receta a la vez, ¿qué pasa cuando el segundo guarda? →
  R: Gana el último que guarda; no se detecta el conflicto. Cada guardado queda en el registro de
  cambios con sus valores antes y después, así que el cambio sobrescrito es recuperable (FR-021,
  FR-023).

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Descubrir qué licencia me corresponde (Prioridad: P1)

Una persona que quiere abrir un negocio en Huanta entra al portal desde su celular, sin crear cuenta
ni iniciar sesión, y abre el asistente de ruta. El asistente le hace tres preguntas, una por una y en
orden, con lenguaje sencillo y opciones para elegir (por ejemplo, qué tipo de establecimiento va a
abrir, si funcionará dentro de un local que ya tiene licencia y qué nivel de riesgo tiene su
actividad). Al responder la tercera, el sistema le propone una licencia y le muestra en la misma
pantalla su nombre, los documentos que debe presentar (señalando cuáles solo se piden en ciertos
casos), cuánto paga, cuánto demora, si la aprobación es automática o requiere evaluación previa,
cuándo es la inspección ITSE y cuánto dura la licencia. En cualquier momento puede volver a la
pregunta anterior para cambiar su respuesta o empezar de nuevo.

**Por qué esta prioridad**: es el corazón de la funcionalidad (RF01, RF02, RF05) y la puerta de
entrada del trámite en línea (EQ-05). Sin ella, el administrado tiene que ir a la municipalidad solo
para preguntar qué licencia le toca.

**Prueba independiente**: con el catálogo cargado con las 12 recetas del TUPA y las preguntas y
reglas de la propuesta actual, abrir el asistente sin sesión, recorrer las combinaciones de
respuestas y comprobar que cada una propone la licencia esperada con sus datos del catálogo.

**Escenarios de aceptación**:

1. **Dado** un visitante sin sesión, **Cuando** abre el asistente, **Entonces** ve solo la primera
   pregunta, con sus opciones, y una indicación de su avance ("Pregunta 1 de 3").
2. **Dado** que respondió la primera pregunta, **Cuando** elige una opción, **Entonces** pasa a la
   segunda pregunta; no puede avanzar sin elegir una opción.
3. **Dado** que respondió "Otro negocio", "No" y "Medio", **Cuando** termina la tercera pregunta,
   **Entonces** el sistema propone la licencia de riesgo medio con tasa S/ 177.10, plazo de 2 días
   hábiles, aprobación automática, ITSE posterior hasta 9 días hábiles y vigencia indeterminada, y la
   lista de requisitos con "Declaración jurada de vigencia de poder (SUNARP) o carta poder" marcada
   como "solo si actúa un representante".
4. **Dado** que respondió "Bodega de hasta 50 m² en mi vivienda", **Cuando** termina, **Entonces** se
   propone la licencia provisional para bodegas, se muestra "Gratuito" como tasa y "Provisional de
   12 meses" como vigencia.
5. **Dado** que está en la segunda o tercera pregunta, **Cuando** pulsa "Volver", **Entonces** regresa
   a la pregunta anterior con su respuesta marcada y puede cambiarla; la propuesta se recalcula con
   las respuestas nuevas.
6. **Dado** que ya ve una propuesta, **Cuando** pulsa "Empezar de nuevo", **Entonces** se borran sus
   respuestas y vuelve a la primera pregunta.
7. **Dado** que respondió "Otro negocio", "No" y "No lo sé", **Cuando** termina, **Entonces** no se
   le propone ninguna licencia: ve que no se pudo determinar porque falta conocer el nivel de riesgo
   y la sugerencia de acudir a la municipalidad.
8. **Dado** un conjunto de respuestas para el que ninguna regla coincide, **Cuando** termina,
   **Entonces** el sistema le dice con claridad que no pudo determinar su licencia y le sugiere acudir
   a la Subgerencia de Comercio, Licencias y Control Sanitario, sin mostrar una licencia equivocada.
9. **Dado** que el administrador cambió la tasa de una licencia, **Cuando** un visitante obtiene esa
   licencia como propuesta (dentro del tiempo máximo de propagación), **Entonces** ve la tasa nueva.

---

### Historia de usuario 2 - Consultar el detalle de cualquier licencia del catálogo (Prioridad: P2)

Una persona que ya sabe qué trámite necesita (o que quiere comparar) abre la lista del catálogo, que
ya existe desde la funcionalidad 001, y elige una licencia o trámite conectado. Ve la misma ficha que
muestra el asistente: nombre, requisitos con sus condiciones, tasa en soles, plazo, calificación,
ITSE y vigencia. No necesita iniciar sesión.

**Por qué esta prioridad**: completa el caso de uso CU02 (hoy solo existe la lista) y sirve a quien
no necesita el asistente; reutiliza la ficha de la historia 1.

**Prueba independiente**: sin sesión, abrir la ficha de cada una de las 12 recetas activas y
comparar cada dato con las fichas de `docs/01-analisis-de-sistema/09-validacion-del-tupa.md`.

**Escenarios de aceptación**:

1. **Dado** un visitante en la lista del catálogo, **Cuando** elige "Licencia de funcionamiento –
   riesgo alto", **Entonces** ve tasa S/ 305.90, plazo de 8 días hábiles, "Evaluación previa con
   silencio positivo", ITSE previa hasta 7 días hábiles, vigencia indeterminada y sus requisitos en
   orden, con los planos marcados como "no se piden si presentó planos en los últimos 5 años y la
   edificación no cambió".
2. **Dado** un trámite conectado (por ejemplo, cambio de giro), **Cuando** abre su ficha,
   **Entonces** ve los datos que tiene (tasa, calificación, requisitos) y los que no aplican (ITSE,
   vigencia, plazo si no tiene) no se muestran como vacíos ni como cero, sino que se omiten o dicen
   "No aplica".
3. **Dado** una receta desactivada, **Cuando** alguien intenta abrir su ficha (por ejemplo, con un
   enlace guardado), **Entonces** ve un mensaje de que esa licencia no está disponible y un enlace al
   catálogo, no los datos de la receta.

---

### Historia de usuario 3 - Actualizar una receta cuando cambia el TUPA (Prioridad: P2)

El administrador del sistema inicia sesión (funcionalidad 002), abre la gestión del catálogo, elige
una receta y cambia lo que modificó el TUPA: la tasa, el plazo, la calificación, el orden y el plazo
del ITSE, la vigencia o los requisitos (agregar, quitar, reordenar, cambiar el texto o la condición).
Al guardar, el sistema valida que la receta siga siendo coherente; si lo es, la guarda, registra
quién la cambió, cuándo y qué valores tenía antes y después, y el cambio aparece en el asistente y en
el catálogo público sin que nadie programe ni reinicie el sistema.

**Por qué esta prioridad**: es lo que hace posible el escenario EQ-06 (cambiar el TUPA sin
programar) y el mantenimiento descrito en el documento 09; sin ella, cada cambio del TUPA exige un
desarrollador. Es P2 porque hoy el catálogo ya está cargado y validado con el TUPA vigente.

**Prueba independiente**: con una cuenta de administrador, cambiar la tasa de una licencia de
prueba y uno de sus requisitos, comprobar que el asistente y la ficha pública muestran los valores
nuevos dentro del tiempo máximo de propagación, que quedó un registro con los valores anteriores y
posteriores, y que no se modificó ninguna línea de código.

**Escenarios de aceptación**:

1. **Dado** un administrador con sesión, **Cuando** abre la gestión del catálogo, **Entonces** ve las
   12 recetas, incluidas las desactivadas (marcadas como tales), y puede abrir cualquiera para
   editarla.
2. **Dado** la receta de riesgo medio, **Cuando** el administrador cambia la tasa de S/ 177.10 a
   S/ 180.00 y guarda, **Entonces** recibe confirmación, la ficha pública y la propuesta del asistente
   muestran S/ 180.00 en un máximo de 5 minutos, y queda un registro con su identificador, la fecha y
   hora, `tasa: 177.10 → 180.00`.
3. **Dado** una receta con 4 requisitos, **Cuando** el administrador agrega uno, cambia el texto de
   otro, mueve el tercero al primer lugar y guarda, **Entonces** la ficha pública muestra los
   requisitos en el orden y con los textos nuevos, y el registro guarda la lista anterior y la
   nueva.
4. **Dado** un requisito, **Cuando** el administrador cambia su condición a "solo si actúa un
   representante", **Entonces** la ficha pública lo muestra como condicional.
5. **Dado** el formulario de edición, **Cuando** el administrador escribe una tasa negativa, un plazo
   de 0 días, deja un requisito sin texto, deja la receta sin requisitos o quita el orden del ITSE de
   una licencia, **Entonces** el sistema no guarda nada y le indica junto a cada campo qué está mal.
6. **Dado** una licencia de la ruta de aprobación automática, **Cuando** el administrador intenta
   cambiar su calificación a "Evaluación previa" o su ITSE a "Previa", **Entonces** el sistema lo
   rechaza explicando que esa combinación no corresponde a la ruta de la licencia (ver Supuestos).
7. **Dado** un usuario con sesión pero sin el rol ADMINISTRADOR, o un visitante sin sesión,
   **Cuando** intenta abrir la gestión del catálogo o guardar una receta, **Entonces** el sistema lo
   rechaza y no cambia nada.
8. **Dado** que dos administradores abrieron la misma receta, **Cuando** el segundo guarda después de
   que el primero ya guardó, **Entonces** queda vigente lo que guardó el segundo y el registro de
   cambios tiene dos entradas: la del primero y la del segundo, cuyo valor "antes" es el que dejó el
   primero.

---

### Historia de usuario 4 - Desactivar y reactivar una receta (Prioridad: P3)

Si el TUPA suspende o elimina un procedimiento, el administrador desactiva su receta en lugar de
borrarla. Una receta desactivada deja de proponerse en el asistente y de mostrarse al público, pero
sigue visible para el administrador, que puede reactivarla.

**Por qué esta prioridad**: es poco frecuente, pero evita que se oriente a los administrados hacia un
trámite que ya no existe.

**Prueba independiente**: desactivar una licencia, comprobar que no aparece en la lista pública, que
su ficha dice "no disponible" y que el asistente no la propone; reactivarla y comprobar que vuelve.

**Escenarios de aceptación**:

1. **Dado** la licencia para cesionarios de riesgo medio activa, **Cuando** el administrador la
   desactiva, **Entonces** en un máximo de 5 minutos deja de aparecer en el catálogo público y su
   ficha muestra "no disponible", y el cambio queda registrado.
2. **Dado** esa licencia desactivada, **Cuando** un visitante responde "Otro negocio", "Sí" y "Medio"
   en el asistente, **Entonces** el sistema no le propone esa licencia ni otra en su lugar: le dice que
   no puede determinar su licencia y le sugiere acudir a la municipalidad.
3. **Dado** una receta desactivada, **Cuando** el administrador la reactiva, **Entonces** vuelve a
   aparecer en el catálogo público y en el asistente en un máximo de 5 minutos.

---

### Casos límite

- **Respuesta que no está entre las opciones o falta una respuesta** (por ejemplo, alguien manipula
  la petición): el sistema no propone nada y responde que las respuestas no son válidas, indicando
  qué pregunta falta o tiene un valor no permitido.
- **Combinación sin regla** (por ejemplo, cesionario de riesgo bajo si la propuesta cambiara): el
  sistema lo dice con claridad y sugiere acudir a la municipalidad; nunca elige una licencia "por
  defecto".
- **La primera regla que coincide apunta a una receta desactivada**: se trata igual que una
  combinación sin regla; no se sigue buscando en las reglas de menor prioridad, para no proponer una
  licencia que no corresponde.
- **El catálogo cambia mientras el visitante responde**: la propuesta se calcula con el catálogo
  vigente en el momento en que termina; no se le muestra una mezcla de datos viejos y nuevos.
- **Servicio no disponible** (no se puede leer el catálogo): el asistente y la ficha muestran un
  mensaje amable con la opción de reintentar, sin detalles técnicos, y no muestran datos inventados
  ni una tasa vacía.
- **Conexión lenta del celular**: mientras carga, la pantalla indica que está cargando y no permite
  elegir dos veces la misma opción.
- **Recarga o retroceso del navegador** a mitad del asistente: el visitante no queda en una pantalla
  rota; puede seguir desde la pregunta en la que estaba o empezar de nuevo (no se guarda nada en el
  servidor).
- **Tasa con más de dos decimales o con texto** (por ejemplo "177,105" o "abc"): se rechaza; la tasa
  se maneja siempre en soles con dos decimales exactos.
- **Tasa cero**: es válida (licencia provisional para bodegas) y se muestra como "Gratuito".
- **Vigencia vacía**: significa "Indeterminada" y así se muestra; no se confunde con un error.
- **Guardar sin cambios**: el sistema avisa que no hay cambios y no crea un registro de auditoría
  vacío.
- **Requisito con texto muy largo o con espacios al inicio y al final**: los espacios se recortan; un
  texto vacío después de recortar se rechaza; un texto mayor al límite se rechaza indicando el máximo.
- **Dos requisitos con el mismo orden**: el sistema reordena según la posición elegida en pantalla;
  nunca quedan dos requisitos con el mismo número.
- **Sesión del administrador vencida al guardar**: el cambio no se aplica y el portal le pide volver a
  iniciar sesión, conservando lo que escribió hasta que reintente.
- **Rol ADMINISTRADOR retirado mientras edita**: el guardado se rechaza (la retirada surte efecto de
  inmediato, funcionalidad 002).

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Asistente de ruta (RF01)**

- **FR-001**: El sistema DEBE ofrecer el asistente de ruta a cualquier visitante, sin iniciar sesión
  ni pedir datos personales.
- **FR-002**: El asistente DEBE presentar las preguntas una por una, en el orden definido en el
  catálogo, mostrando para cada una su texto y sus opciones tal como están guardadas en el catálogo;
  ningún texto de pregunta u opción DEBE estar fijado en el programa.
- **FR-003**: El asistente DEBE indicar el avance (pregunta actual y total) y no DEBE permitir
  avanzar sin elegir una opción.
- **FR-004**: El visitante DEBE poder volver a la pregunta anterior conservando la respuesta que dio
  y cambiarla, y DEBE poder empezar de nuevo desde cualquier punto, lo que borra todas sus
  respuestas.
- **FR-005**: Con todas las respuestas, el sistema DEBE proponer una licencia evaluando las reglas
  guardadas como datos en orden de prioridad (de menor a mayor número) y eligiendo la **primera**
  cuyas condiciones coinciden con las respuestas. Una regla coincide cuando todas sus condiciones
  son iguales a las respuestas dadas; las preguntas que la regla no menciona no importan.
- **FR-006**: Si ninguna regla coincide, o si la primera regla que coincide apunta a una receta
  desactivada, el sistema DEBE informar con claridad que no pudo determinar la licencia y sugerir
  acudir a la Subgerencia de Comercio, Licencias y Control Sanitario; NO DEBE proponer otra licencia
  en su lugar.
- **FR-007**: El sistema DEBE rechazar respuestas incompletas o con valores que no están entre las
  opciones de su pregunta, indicando qué pregunta está mal, sin proponer ninguna licencia.
- **FR-008**: La propuesta DEBE indicar que es orientativa y que la municipalidad confirma el nivel
  de riesgo al evaluar la solicitud.
- **FR-009**: El asistente NO DEBE guardar las respuestas del visitante en el servidor ni pedirle
  datos que lo identifiquen.

**Ficha de la licencia (RF02, RF05)**

- **FR-010**: Para la licencia propuesta y para cualquier receta activa del catálogo, el sistema DEBE
  mostrar una ficha con: nombre; requisitos en su orden, señalando con lenguaje sencillo los que son
  condicionales y su condición ("solo si actúa un representante", "solo si su giro lo exige", "no se
  piden si presentó planos en los últimos 5 años y la edificación no cambió"); tasa en soles con dos
  decimales, o "Gratuito" si es cero; plazo con su tipo de días (hábiles o calendario); calificación
  ("Aprobación automática" o "Evaluación previa con silencio positivo", o "Servicio prestado en
  exclusividad"); cuándo es la inspección ITSE y en qué plazo; y vigencia ("Indeterminada" o
  "Provisional de N meses").
- **FR-011**: Los datos que no aplican a una receta (por ejemplo, ITSE o vigencia en un trámite
  conectado) DEBEN omitirse o mostrarse como "No aplica", nunca como vacío o cero.
- **FR-012**: La tasa mostrada DEBE leerse siempre del catálogo vigente; ningún monto DEBE estar
  fijado en el programa (RF05).
- **FR-013**: Una receta desactivada NO DEBE aparecer en la lista pública, NI proponerse en el
  asistente, NI mostrarse en su ficha pública; quien abra su ficha DEBE ver que no está disponible.
- **FR-014**: La ficha y la propuesta DEBEN ser accesibles sin iniciar sesión.

**Gestión del catálogo por el administrador (RF21)**

- **FR-015**: Solo un usuario con sesión iniciada y el rol ADMINISTRADOR DEBE poder ver la gestión
  del catálogo y guardar cambios en una receta; cualquier otro intento DEBE rechazarse sin cambiar
  nada.
- **FR-016**: El administrador DEBE ver todas las recetas, activas y desactivadas, distinguiendo su
  estado.
- **FR-017**: El administrador DEBE poder cambiar de una receta: tasa, plazo en días, calificación,
  orden del ITSE, plazo del ITSE, vigencia, estado activa/desactivada y sus requisitos (agregar,
  quitar, reordenar, cambiar el texto, si es obligatorio y su condición, elegida de la lista
  existente de condiciones).
- **FR-018**: El administrador NO DEBE poder crear ni borrar recetas, ni cambiar su código, nombre,
  tipo, ruta, código o página del TUPA, ni editar las preguntas o reglas del asistente.
- **FR-019**: El sistema DEBE rechazar por completo (sin guardar nada) un cambio que deje la receta
  inválida, indicando cada campo con problema. Como mínimo es inválido: tasa negativa, con más de dos
  decimales o no numérica; plazo o plazo del ITSE menor que 1; vigencia menor que 1 (vacía significa
  indeterminada); una licencia sin orden del ITSE; una receta sin requisitos; un requisito sin texto o
  con texto mayor a 500 caracteres; y una combinación de calificación y orden del ITSE que no
  corresponde a la ruta de la licencia (ruta A: aprobación automática con ITSE posterior; ruta B:
  evaluación previa con ITSE previa; ruta C: aprobación automática con ITSE notificada dentro de 6
  meses).
- **FR-020**: Al guardar, el orden de los requisitos DEBE quedar consecutivo desde 1, sin números
  repetidos.
- **FR-021**: Cada cambio guardado DEBE quedar registrado en la misma operación que el cambio: quién
  lo hizo (identificador interno del usuario), cuándo, la receta y los valores de cada dato
  modificado antes y después (incluida la lista completa de requisitos si cambió). Si el registro no
  puede guardarse, el cambio tampoco se guarda.
- **FR-022**: Guardar sin cambios reales NO DEBE crear un registro.
- **FR-023**: Si dos administradores guardan la misma receta, DEBE quedar vigente el último guardado
  (sin detección de conflicto); cada guardado DEBE generar su propio registro, cuyo valor "antes" es
  el valor guardado en ese momento, no el que el administrador vio al abrir la receta.
- **FR-024**: Un cambio guardado (incluida la activación o desactivación) DEBE reflejarse en el
  asistente, la ficha y la lista públicas sin programar ni reiniciar el sistema, normalmente en la
  siguiente consulta y **como máximo en 5 minutos** (EQ-06); este tiempo máximo DEBE quedar
  documentado para el administrador.
- **FR-025**: Los cambios en una receta NO DEBEN alterar los trámites ya presentados con ella: cada
  trámite conserva la tasa, el plazo y los requisitos con los que se presentó (regla que aplican las
  funcionalidades 004 y 005).

**Protección de datos y calidad**

- **FR-026**: El registro de cambios, los mensajes de error y los registros del sistema NO DEBEN
  contener datos personales del administrador (correo, celular, nombre); se identifica solo con su
  identificador interno.
- **FR-027**: Las pantallas del asistente, de la ficha de la licencia y de edición de recetas DEBEN
  usarse bien en un celular de 360 px de ancho sin desplazamiento horizontal, con controles táctiles
  de tamaño adecuado, y DEBEN cumplir las pautas de accesibilidad (etiquetas, contraste, navegación
  con teclado y lector de pantalla, foco visible al cambiar de pregunta) (EQ-05).
- **FR-028**: La consulta del catálogo, la ficha y la propuesta del asistente DEBEN cumplir la meta
  de rendimiento de EQ-01 con hasta 1,000 usuarios simultáneos.

### Entidades clave

- **Receta**: un procedimiento del TUPA (9 licencias y 3 trámites conectados). Datos visibles:
  código, nombre, tipo (licencia o trámite conectado), código y página del TUPA, ruta (A, B o C),
  nivel de riesgo, tasa en soles, plazo y tipo de días, calificación, orden y plazo del ITSE,
  vigencia, estado activa/desactivada, y quién y cuándo la actualizó por última vez. Ya existe desde
  la funcionalidad 001.
- **Requisito**: un documento que pide una receta. Tiene orden, texto, si es obligatorio y su
  condición (siempre, con representante, giro especial, sin planos vigentes). Pertenece a una sola
  receta.
- **Pregunta del asistente**: código, orden, texto y lista de opciones (valor y texto visible). Se
  cambia solo por migración en esta funcionalidad.
- **Regla del asistente**: prioridad única, condiciones (pares pregunta → valor) y la receta que
  propone. Se cambia solo por migración en esta funcionalidad.
- **Propuesta del asistente**: resultado de evaluar las respuestas; es la ficha de una receta o el
  aviso de que no se pudo determinar. No se guarda.
- **Cambio de receta** (nuevo): registro inmutable de cada modificación: receta, usuario (identificador
  interno), fecha y hora, y valores anteriores y posteriores de los datos cambiados.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Una persona que usa el asistente por primera vez, desde su celular y sin ayuda, responde
  las tres preguntas y ve la ficha de su licencia en 3 minutos o menos (parte del presupuesto de
  15 minutos de EQ-05).
- **SC-002**: El 100 % de las combinaciones de respuestas posibles (3 × 2 × 5 = 30, contando
  "No lo sé") produce la
  licencia esperada según la tabla de reglas vigente, o el aviso de "no determinada" donde no hay
  regla; los expedientes reales que entregue la Municipalidad (documento 09, paso 4) se agregan como
  casos de prueba con el mismo criterio.
- **SC-003**: Las 12 fichas públicas coinciden al 100 % con las fichas del TUPA del documento 09
  (tasa, plazo, calificación, ITSE, vigencia y requisitos).
- **SC-004** (EQ-01): con 1,000 usuarios simultáneos consultando el catálogo, las fichas y el
  asistente, el 95 % de las respuestas llega en 2 segundos o menos y menos del 1 % falla por error
  del sistema.
- **SC-005** (EQ-06): cambiar una tasa o un requisito no requiere modificar ninguna línea de código
  ni reiniciar el sistema, y el valor nuevo se ve en el asistente y en la ficha pública en 5 minutos
  o menos; las pruebas de los demás módulos siguen aprobándose.
- **SC-006**: El 100 % de los cambios guardados tiene su registro con usuario, fecha y valores antes y
  después; el 0 % de los intentos con datos inválidos o sin permiso modifica una receta.
- **SC-007**: Un administrador actualiza la tasa y un requisito de una receta en 3 minutos o menos
  desde que abre la gestión del catálogo.
- **SC-008** (EQ-05): la auditoría móvil de las pantallas del asistente, la ficha y la edición de
  recetas obtiene al menos 90 en accesibilidad y al menos 90 en buenas prácticas, y ninguna tiene
  desplazamiento horizontal a 360 px.
- **SC-009**: Ninguna receta desactivada aparece en la lista pública, en una ficha pública ni como
  propuesta del asistente, en el 100 % de las pruebas.

## Supuestos

- **Preguntas y reglas**: se usan las tres preguntas y las nueve reglas de la propuesta actual
  (`docs/05-modelo-de-datos/datos-semilla.sql`), pendientes de validar con la Municipalidad (duda
  N.° 2 del documento 09). Si cambian, se actualizan por migración sin cambiar el programa del
  asistente. Con la propuesta actual, "cesionario de riesgo bajo" cae en la licencia de riesgo bajo,
  porque el TUPA no tiene una licencia de cesionario de riesgo bajo. A la tercera pregunta se le
  agrega la opción "No lo sé" (Aclaraciones), sin regla asociada.
- **Siempre tres preguntas**: el asistente hace las tres preguntas aunque una respuesta temprana ya
  decida la licencia (por ejemplo, bodega); saltar preguntas según la respuesta queda fuera de
  alcance.
- **Ruta fija**: la ruta de cada licencia (A, B o C) no se edita desde el portal, porque el motor de
  trámites se comporta distinto en cada ruta. Por eso la calificación y el orden del ITSE deben seguir
  siendo coherentes con la ruta (FR-019). Si el TUPA cambiara la ruta de una licencia, se haría por
  migración, igual que las preguntas y reglas.
- **Tasas en soles fijos**: se guardan como montos en soles, tal como los publica el TUPA; el recálculo
  con la UIT (duda N.° 3) queda fuera de alcance.
- **Tiempo máximo de propagación**: 5 minutos, que coincide con la decisión ya tomada en el
  documento 07 (ADR-005) sobre cuánto puede tardar en verse un cambio del catálogo; normalmente el
  cambio se ve en la siguiente consulta.
- **Consulta del registro de cambios**: el registro se guarda y se puede revisar para auditoría
  directamente en los datos; una pantalla o servicio para consultarlo queda fuera de alcance
  (Aclaraciones) y corresponde al módulo de Reportes.
- **Conflicto de edición**: gana el último que guarda (Aclaraciones); no se bloquea la receta ni se
  detecta el conflicto. Se acepta porque hay pocos administradores y el registro de cambios permite
  recuperar un valor sobrescrito.
- **Lista de condiciones de requisitos fija**: las cuatro condiciones existentes (siempre, con
  representante, giro especial, sin planos vigentes) cubren los requisitos actuales del TUPA; agregar
  una condición nueva requiere migración.
- **Dependencias**: usa la lista pública del catálogo (funcionalidad 001) y el inicio de sesión, los
  roles y la invalidación inmediata de permisos (funcionalidad 002).
- **Fuera de alcance**: crear o borrar recetas (las 12 del TUPA ya existen); editar las preguntas,
  las opciones o las reglas del asistente desde el portal; presentar la solicitud y el formulario
  dinámico (funcionalidad 004); generar la esquela (funcionalidad 005); el asistente por chat
  (Fase 2).
