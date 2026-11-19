# Especificación de funcionalidad: Presentar solicitud y consultar el estado del trámite

**Rama de la funcionalidad**: `004-solicitud-consulta`

**Creada**: 2026-11-18

**Estado**: Borrador

**Entrada**: Descripción de la usuaria: "Usa como entrada el archivo docs/sdd/004-solicitud-specify.md"
(Funcionalidad 004: Presentar solicitud y consultar el estado del trámite. Como administrado quiero
confirmar mi identidad y llenar un formulario que solo me pida los documentos de mi licencia, para
que nadie presente un trámite a mi nombre y para no presentar requisitos innecesarios. Como
administrado quiero consultar el estado de mi trámite con mi número de expediente y mi DNI/RUC desde
el celular, para no hacer colas y sin que otra persona vea mis datos. Como personal de mesa de partes
quiero registrar la solicitud de quien viene en persona, para que el trámite presencial siga el mismo
camino que el trámite en línea.)

**Cubre**: HU02 y HU05; RF03, RF04, RF06 y RF07; casos de uso CU03, CU04, CU06 y CU12; escenarios de
calidad EQ-01, EQ-04 y EQ-05; ADR-002 (motor único + catálogo de recetas), ADR-007 (seguridad por
capas) y Ley N.° 29733 (datos personales). Issues de GitHub: #5 (HU02) y #8 (HU05). Usa el catálogo
y el asistente de la funcionalidad 003 y la seguridad del personal de la funcionalidad 002.

## Aclaraciones

### Sesión 2026-11-18

- P: ¿Cómo se cuentan los 5 intentos fallidos de la consulta pública antes de bloquear? → R: Solo
  por el origen de quien consulta (opción más simple que cumple la constitución): 5 fallos desde la
  misma conexión en 15 minutos bloquean esa conexión. Frena a quien prueba muchos números seguidos
  (EQ-04) sin que un tercero pueda bloquear la consulta del titular legítimo fallando a propósito
  sobre su número.
- P: ¿El permiso de 15 minutos sirve para presentar una sola solicitud o varias? → R: Una sola: el
  permiso se gasta al crear el expediente; los reintentos de esa misma solicitud devuelven el mismo
  expediente. Para otra solicitud se vuelve a confirmar la identidad.
- P: ¿Los requisitos "solo si tu giro lo exige" y "no se pide si presentaste planos en los últimos 5
  años" se preguntan en el formulario o se muestran como opcionales? → R: Se muestran como opcionales
  con su explicación; no bloquean la presentación y el evaluador decide si faltan (observación en la
  006).
- P: ¿El correlativo del número de expediente se reinicia cada año? → R: No: es un correlativo único
  que nunca se reinicia; el año del prefijo solo indica cuándo se presentó (por ejemplo, el primer
  expediente de 2027 puede ser EXP-2027-000154).
- P: ¿En la bandeja, los roles ven todos los expedientes o solo los de ciertos estados? → R: Mesa de
  partes, evaluador y jefatura ven todos los expedientes, con filtros por estado y ruta; la
  restricción por estado o por evaluador asignado, si hace falta, se decide en la 006.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Presentar la solicitud en línea con identidad confirmada (Prioridad: P1)

Una persona que ya sabe qué licencia necesita (porque la eligió en el inicio, en la ficha de la
licencia o en la propuesta del asistente) quiere presentar su solicitud desde el celular, sin ir a la
municipalidad. Primero confirma quién es: ingresa su RUC y su DNI con la fecha de emisión (o su carné
de extranjería) y su número de celular. El sistema comprueba esos datos con el servicio de
identificación y le envía un código de 6 dígitos al celular. Con el código correcto, tiene 15 minutos
para presentar. Luego llena un formulario con sus datos y los de su establecimiento (nombre
comercial, giro, dirección, zona y área) y adjunta **solo** los documentos que pide esa licencia; los
requisitos condicionales aparecen únicamente cuando aplican (por ejemplo, la carta poder solo si
actúa un representante). Al presentar, recibe su número de expediente, la licencia, la ruta del
trámite y lo que sigue, y puede guardarlo o imprimirlo.

**Por qué esta prioridad**: es el trámite en sí (HU02, RF04, RF06, RF07) y el inicio de todo el flujo
posterior (evaluación, pago, inspección y licencia). Sin él, el portal solo informa.

**Prueba independiente**: con el catálogo de la 003 cargado y el servicio de identificación
simulado, confirmar la identidad de una persona ficticia, presentar la solicitud de la licencia de
riesgo medio con sus documentos y comprobar que se crea un expediente REGISTRADO con su número, la
ruta A y su primer registro en el historial de estados.

**Escenarios de aceptación**:

1. **Dado** un visitante que eligió la licencia de riesgo medio, **Cuando** pulsa "Presentar
   solicitud", **Entonces** se le pide confirmar su identidad antes de ver el formulario.
2. **Dado** que ingresó RUC, DNI con fecha de emisión y celular válidos, **Cuando** los envía,
   **Entonces** el sistema los comprueba con el servicio de identificación y le envía un código de 6
   dígitos al celular, mostrando el celular enmascarado (por ejemplo, 9*****321).
3. **Dado** que recibió el código, **Cuando** lo ingresa correctamente, **Entonces** queda habilitado
   para presentar durante 15 minutos.
4. **Dado** que los datos de identidad no coinciden con el servicio de identificación, **Cuando** los
   envía, **Entonces** el sistema responde con un mensaje que no dice qué dato falló y no envía
   ningún código.
5. **Dado** que está habilitado para presentar la licencia de riesgo medio, **Cuando** abre el
   formulario, **Entonces** ve solo los requisitos de esa licencia, y la carta poder aparece solo si
   indica que actúa un representante.
6. **Dado** que falta el documento de un requisito obligatorio que aplica, **Cuando** intenta
   presentar, **Entonces** el sistema señala ese requisito y no crea el expediente.
7. **Dado** un formulario completo con sus documentos, **Cuando** presenta, **Entonces** se crea un
   expediente con un número único y legible (por ejemplo, EXP-2026-000001), la ruta que corresponde a
   la licencia (A, B o C), el estado REGISTRADO, el canal "en línea" y el primer registro del
   historial de estados; y la persona ve su número, la licencia, la ruta y qué sigue.
8. **Dado** que pulsa "Presentar" dos veces seguidas o pierde la conexión y reintenta, **Cuando** el
   sistema recibe la misma solicitud otra vez, **Entonces** existe un solo expediente y la persona ve
   el mismo número.
9. **Dado** que pasaron más de 15 minutos desde que confirmó su identidad, **Cuando** intenta
   presentar, **Entonces** el sistema le pide confirmar su identidad otra vez, sin perder lo que ya
   llenó en esa pantalla.
10. **Dado** que llegó desde la propuesta del asistente o desde la ficha de una licencia, **Cuando**
    pulsa "Presentar solicitud", **Entonces** el formulario ya tiene esa licencia elegida.

---

### Historia de usuario 2 - Consultar el estado del trámite sin cuenta (Prioridad: P1)

Una persona que presentó su solicitud quiere saber cómo va, desde el celular y sin crear una cuenta.
Ingresa juntos su número de expediente y su DNI, carné de extranjería o RUC. Si los dos coinciden, ve
el estado actual en lenguaje sencillo ("Tu solicitud fue registrada y espera evaluación"), la
licencia, la fecha de presentación y el historial de estados con sus fechas. Si no coinciden, el
mensaje es el mismo sin importar cuál de los dos datos está mal, para que nadie pueda adivinar
expedientes ajenos; y tras varios intentos fallidos la consulta se bloquea por un tiempo.

**Por qué esta prioridad**: evita colas y llamadas para preguntar (HU05, RF03) y es la otra cara del
trámite en línea. Comparte prioridad con la historia 1 porque, sin ella, la persona que presenta en
línea no tiene cómo seguir su trámite.

**Prueba independiente**: con un expediente creado, consultar con el número y el DNI correctos y ver
su estado; consultar con un DNI ajeno y comprobar que el mensaje es igual al de un número
inexistente; fallar 5 veces y comprobar que el 6.º intento queda bloqueado.

**Escenarios de aceptación**:

1. **Dado** un expediente REGISTRADO, **Cuando** el titular consulta con su número y su DNI,
   **Entonces** ve "Registrado" con su explicación en lenguaje sencillo, la licencia, la fecha de
   presentación y el historial de estados.
2. **Dado** el mismo expediente, **Cuando** consulta con su número y su RUC, **Entonces** ve lo mismo.
3. **Dado** un número de expediente existente y un DNI que no es el del titular, **Cuando** consulta,
   **Entonces** ve el mismo mensaje que con un número inexistente ("No encontramos un trámite con esos
   datos"), sin decir cuál dato falló.
4. **Dado** 5 consultas fallidas en 15 minutos desde la misma conexión, **Cuando** intenta la 6.ª, **Entonces** la consulta
   queda bloqueada temporalmente y se le indica desde qué hora puede volver a intentar, aunque esta
   vez los datos sean correctos.
5. **Dado** una consulta correcta, **Cuando** ve el resultado, **Entonces** no aparecen su documento,
   su RUC, su celular ni su dirección completos.
6. **Dado** que consulta desde el celular, **Cuando** usa la página, **Entonces** el número y el
   documento se envían sin aparecer en la dirección de la página.

---

### Historia de usuario 3 - Registrar una solicitud presencial en mesa de partes (Prioridad: P2)

Una persona llega a la municipalidad con sus documentos en papel. El personal de mesa de partes, con
su sesión iniciada, registra la solicitud con el mismo formulario y las mismas validaciones del
trámite en línea. En lugar del código al celular, el personal verifica la identidad con el documento
físico y con el servicio de identificación. El expediente resultante es igual a uno en línea, con el
canal "mesa de partes" y el registro de qué usuario lo registró.

**Por qué esta prioridad**: el trámite presencial debe seguir el mismo camino que el trámite en
línea (RC12, CU12) y muchas personas seguirán yendo en persona. Depende del formulario de la
historia 1.

**Prueba independiente**: con un usuario de prueba con rol MESA_PARTES, registrar la solicitud de una
persona ficticia sin código al celular y comprobar que el expediente tiene canal "mesa de partes", el
usuario que lo registró y las mismas validaciones que en línea.

**Escenarios de aceptación**:

1. **Dado** un usuario con rol MESA_PARTES, **Cuando** registra una solicitud, **Entonces** el sistema
   comprueba la identidad con el servicio de identificación sin pedir código al celular.
2. **Dado** el registro completo, **Cuando** lo guarda, **Entonces** se crea un expediente REGISTRADO
   con canal "mesa de partes" y el identificador del usuario que lo registró.
3. **Dado** que falta un documento obligatorio, **Cuando** intenta guardar, **Entonces** el sistema lo
   señala igual que en línea y no crea el expediente.
4. **Dado** un usuario sin rol MESA_PARTES (por ejemplo, CAJA), **Cuando** intenta registrar una
   solicitud presencial, **Entonces** el sistema lo rechaza sin crear nada.
5. **Dado** que se registró la solicitud, **Cuando** termina, **Entonces** el personal ve el número de
   expediente para entregárselo a la persona, impreso o anotado.

---

### Historia de usuario 4 - Ver la bandeja de expedientes del personal (Prioridad: P3)

El personal de mesa de partes, los evaluadores y la jefatura necesitan ver los expedientes que van
llegando: número, licencia, ruta, estado, titular y fecha de presentación, con filtros por estado y
por ruta, y abrir el detalle de cada uno con sus documentos.

**Por qué esta prioridad**: es el punto de partida del trabajo del personal (la evaluación es la
funcionalidad 006), pero el trámite ya puede presentarse y consultarse sin ella.

**Prueba independiente**: con varios expedientes creados, entrar como evaluador, filtrar por estado
REGISTRADO y ruta B, abrir un expediente y descargar uno de sus documentos; entrar como CAJA y
comprobar que se rechaza.

**Escenarios de aceptación**:

1. **Dado** un usuario con rol MESA_PARTES, EVALUADOR o JEFATURA, **Cuando** abre la bandeja,
   **Entonces** ve los expedientes con número, licencia, ruta, estado, titular y fecha de
   presentación, del más reciente al más antiguo.
2. **Dado** la bandeja, **Cuando** filtra por estado y por ruta, **Entonces** ve solo los expedientes
   que cumplen los dos filtros.
3. **Dado** un expediente de la bandeja, **Cuando** lo abre, **Entonces** ve sus datos, el historial
   de estados y la lista de documentos por requisito, y puede abrir cada documento.
4. **Dado** un usuario con otro rol (INSPECTOR, CAJA o ADMINISTRADOR) o sin sesión, **Cuando** intenta
   abrir la bandeja o un expediente, **Entonces** el sistema lo rechaza.

---

### Casos límite

- **Servicio de identificación sin respuesta**: el sistema lo dice con claridad ("No pudimos
  verificar tu identidad en este momento"), sugiere acudir a mesa de partes y **no** deja presentar
  sin identidad confirmada.
- **Código incorrecto o vencido**: el código vale 5 minutos; un código incorrecto o vencido no
  habilita la presentación. Se puede pedir otro código sin repetir los datos de identidad.
- **Demasiados intentos de identidad o de código**: tras 5 intentos fallidos en 15 minutos se bloquea
  temporalmente ese intento, igual que el inicio de sesión del personal (002).
- **Control de intentos no disponible**: si el sistema no puede contar los intentos, rechaza la
  verificación en lugar de permitirla sin límite (falla cerrado).
- **Representante legal o apoderado**: si la persona indica que actúa un representante, se piden
  también el documento del representante y la carta poder o el poder inscrito en SUNARP como documento
  adjunto; si no, ese requisito no aparece.
- **Archivo de tipo no permitido**: un archivo que no es PDF, JPG ni PNG, o que tiene la extensión
  cambiada (por ejemplo, un ejecutable renombrado a .pdf), se rechaza al subirlo.
- **Archivo demasiado grande**: un archivo de más de 10 MB se rechaza al subirlo, con un mensaje que
  dice el límite.
- **Archivo subido y abandonado**: un documento subido que no se usa en una solicitud en 24 horas se
  descarta.
- **Licencia desactivada o inexistente**: no se puede presentar una solicitud de una licencia
  desactivada (003) ni de un trámite conectado (fuera de alcance); el sistema lo indica y no crea el
  expediente.
- **La receta cambia mientras la persona llena el formulario**: el expediente se crea con la tasa, el
  plazo y los requisitos vigentes al momento de presentar; si los requisitos cambiaron y falta un
  documento nuevo obligatorio, el sistema lo señala.
- **Cambios posteriores del catálogo**: un cambio de la receta después de presentar no altera el
  expediente: conserva la tasa, el plazo y los requisitos con los que se presentó (FR-025 de la 003).
- **Bodega de más de 50 m²**: la licencia provisional para bodegas solo admite áreas de hasta 50 m²;
  un área mayor se rechaza en el campo.
- **Mismo titular, otra solicitud**: una persona puede presentar varias solicitudes distintas (por
  ejemplo, para dos establecimientos), pero cada una con su propia confirmación de identidad, porque
  el permiso se gasta al presentar; solo se evita el duplicado de la **misma** solicitud enviada dos
  veces.
- **Consulta con espacios o minúsculas**: el número de expediente se acepta sin distinguir mayúsculas
  y sin espacios al inicio o al final.
- **Sesión del personal vencida al registrar**: se aplica lo mismo que en la edición del catálogo
  (003): se conserva lo escrito y se pide ingresar de nuevo.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Identidad del solicitante en línea (CU03, RF06)**

- **FR-001**: Antes de presentar en línea, el sistema DEBE pedir el RUC y, además, el DNI con su fecha
  de emisión o el carné de extranjería, y el número de celular del solicitante.
- **FR-002**: El sistema DEBE comprobar los datos de identidad con el servicio de identificación
  (DNI/RUC) y, solo si coinciden, enviar un código de 6 dígitos al celular indicado, válido por 5
  minutos.
- **FR-003**: Con el código correcto, el sistema DEBE habilitar al solicitante para presentar **una
  sola** solicitud durante 15 minutos, a nombre de la identidad confirmada. El permiso se gasta al
  crear el expediente: un reintento de esa misma solicitud devuelve el mismo expediente (FR-020) y
  cualquier otra solicitud exige confirmar la identidad de nuevo.
- **FR-004**: El servicio de identificación DEBE poder reemplazarse (hoy se usa uno simulado, porque
  el real no está contratado) sin cambiar las reglas del trámite.
- **FR-005**: Si el servicio de identificación no responde, el sistema DEBE informarlo con claridad,
  sugerir acudir a mesa de partes y NO DEBE permitir presentar sin identidad confirmada.
- **FR-006**: Los intentos de verificación de identidad y de código DEBEN limitarse a 5 fallidos en 15
  minutos, con bloqueo temporal; si el sistema no puede contar los intentos, DEBE rechazar la
  verificación (falla cerrado).
- **FR-007**: Los mensajes de error de identidad NO DEBEN indicar cuál dato falló.

**Formulario y documentos (CU04, RF04)**

- **FR-008**: El solicitante DEBE poder elegir la licencia en el portal o llegar con ella ya elegida
  desde la ficha o la propuesta del asistente (003). Solo se ofrecen licencias activas; los trámites
  conectados quedan fuera de esta funcionalidad.
- **FR-009**: El formulario DEBE pedir los datos del titular (nombre o razón social y correo
  opcional), si actúa un representante, y los del establecimiento: nombre comercial (opcional), giro,
  dirección, zona y área en m².
- **FR-010**: El formulario DEBE pedir solo los documentos de los requisitos de la licencia elegida,
  en el orden del catálogo. Los requisitos condicionales DEBEN aparecer solo cuando aplican: "solo si
  actúa un representante" según lo que indique el solicitante (y entonces es obligatorio). Los
  condicionales de giro especial y de planos de los últimos 5 años DEBEN mostrarse siempre como
  opcionales, con su explicación, sin preguntas adicionales; no bloquean la presentación y el
  evaluador decide si faltan (006).
- **FR-011**: Si actúa un representante legal o apoderado, el formulario DEBE pedir también su
  documento y la carta poder o el poder inscrito en SUNARP como documento adjunto.
- **FR-012**: NO DEBE poder presentarse una solicitud a la que le falte el documento de un requisito
  obligatorio que aplica; el sistema DEBE señalar cada requisito faltante.
- **FR-013**: Los documentos DEBEN subirse uno por uno antes de presentar. Solo se aceptan PDF, JPG o
  PNG de hasta 10 MB; el sistema DEBE comprobar el tipo real del contenido, no solo la extensión, y
  guardar una huella del archivo que permita comprobar después que no cambió.
- **FR-014**: Un documento subido que no se usa en una solicitud dentro de las 24 horas DEBE
  descartarse.
- **FR-015**: Para la licencia provisional para bodegas, el área NO DEBE superar 50 m².

**Presentación y expediente (CU04, RF07)**

- **FR-016**: Al presentar, el sistema DEBE crear el expediente con un número único y legible con el
  formato EXP-AAAA-NNNNNN (año de presentación y un correlativo único de 6 cifras que nunca se
  reinicia, ni al cambiar de año), asignar la ruta A, B o C según la
  licencia elegida (RF07), dejar el estado REGISTRADO y guardar el primer registro del historial de
  estados, todo en una sola operación.
- **FR-017**: El expediente DEBE conservar la tasa, el plazo, la calificación y los requisitos de la
  receta tal como estaban al presentar; un cambio posterior del catálogo no lo altera.
- **FR-018**: Al crear el expediente, el sistema DEBE dejar registrado el evento "solicitud
  presentada" para que la funcionalidad de notificaciones (008) lo use; esta funcionalidad no envía
  avisos.
- **FR-019**: La tasa NO DEBE cobrarse al presentar: la esquela se genera después, cuando el evaluador
  confirma el nivel de riesgo (funcionalidades 005 y 006).
- **FR-020**: Enviar dos veces la misma solicitud (doble clic, reconexión o reintento) NO DEBE crear
  dos expedientes: el segundo envío DEBE devolver el mismo expediente.
- **FR-021**: Al terminar, el solicitante DEBE ver su número de expediente, la licencia, la ruta, el
  estado y qué sigue, y poder guardar o imprimir ese comprobante.
- **FR-022**: La fecha de vencimiento del plazo DEBE quedar vacía hasta que exista el cálculo en días
  hábiles con feriados (funcionalidad 008).

**Mesa de partes (CU12)**

- **FR-023**: Un usuario con sesión y rol MESA_PARTES DEBE poder registrar una solicitud presencial
  con el mismo formulario y las mismas validaciones que en línea, comprobando la identidad con el
  servicio de identificación y el documento físico, sin código al celular.
- **FR-024**: El expediente DEBE registrar su canal (en línea o mesa de partes) y, en mesa de partes,
  el identificador del usuario que lo registró.
- **FR-025**: Cualquier otro rol o un usuario sin sesión NO DEBE poder registrar solicitudes
  presenciales.

**Bandeja del personal**

- **FR-026**: Los roles MESA_PARTES, EVALUADOR y JEFATURA DEBEN ver una bandeja con **todos** los
  expedientes (número, licencia, ruta, estado, titular y fecha de presentación), sin restricción por
  estado ni por evaluador asignado, del más reciente al más antiguo, paginada y con filtros por estado
  y por ruta.
- **FR-027**: Esos roles DEBEN poder abrir el detalle de un expediente, con su historial de estados y
  sus documentos por requisito, y abrir cada documento.
- **FR-028**: Los demás roles (INSPECTOR, CAJA, ADMINISTRADOR) y los usuarios sin sesión NO DEBEN
  acceder a la bandeja ni al detalle.

**Consulta pública del estado (CU06, RF03)**

- **FR-029**: Cualquier persona, sin cuenta, DEBE poder consultar un expediente ingresando **juntos**
  su número y el DNI, carné de extranjería o RUC del titular.
- **FR-030**: Si los datos coinciden, el sistema DEBE mostrar el estado actual en lenguaje sencillo,
  la licencia, la ruta, la fecha de presentación y el historial de estados con sus fechas.
- **FR-031**: Si no coinciden (o el número no existe), el sistema DEBE responder con el mismo mensaje
  en todos los casos, sin indicar cuál dato falló.
- **FR-032**: Tras 5 consultas fallidas en 15 minutos desde el mismo origen (la conexión de quien
  consulta), la consulta DEBE bloquearse temporalmente para ese origen, también para datos correctos,
  indicando desde qué hora se puede volver a intentar (EQ-04). Los fallos no se cuentan por número de
  expediente, para que nadie pueda bloquear la consulta del titular fallando a propósito.
- **FR-033**: El resultado de la consulta pública NO DEBE mostrar el documento, el RUC, el celular, el
  correo ni la dirección completos del titular.

**Datos personales (Ley N.° 29733, principio VII)**

- **FR-034**: El documento, el RUC, el celular, el correo, la dirección y los datos del representante
  DEBEN guardarse cifrados, y la búsqueda por documento o RUC DEBE hacerse sin descifrarlos.
- **FR-035**: Los datos personales NUNCA DEBEN aparecer en direcciones de páginas o servicios, en los
  registros del sistema ni en los mensajes de error; los registros identifican el expediente solo por
  su número o identificador interno.
- **FR-036**: Cada presentación, registro presencial y consulta del detalle por el personal DEBE
  quedar en la auditoría del expediente en la misma operación, con el usuario o el canal, sin datos
  personales.

**Calidad**

- **FR-037**: La consulta del estado DEBE cumplir la meta de rendimiento de EQ-01 con hasta 1,000
  usuarios simultáneos.
- **FR-038**: Las pantallas de identidad, formulario, comprobante, consulta y bandeja DEBEN poder
  usarse desde el celular y con teclado y lector de pantalla (EQ-05).

### Entidades clave

- **Verificación de identidad**: intento de confirmar la identidad de un solicitante en línea: datos
  enviados al servicio de identificación, código enviado al celular, vencimiento e intentos. Si se
  confirma, da un permiso de 15 minutos para presentar una sola solicitud a nombre de esa identidad.
- **Documento subido**: archivo adjuntado antes de presentar: tipo real, tamaño, huella, fecha de
  subida y, al presentar, el requisito y el expediente al que pertenece. Si no se usa en 24 horas, se
  descarta.
- **Expediente**: la solicitud presentada: número EXP-AAAA-NNNNNN (correlativo único que no se
  reinicia cada año), licencia y su receta al momento
  de presentar, ruta, estado, canal, titular (datos personales cifrados), representante si actúa uno,
  establecimiento (nombre comercial, giro, dirección cifrada, zona y área), fecha de presentación,
  vencimiento del plazo (vacío por ahora) y quién lo registró en mesa de partes.
- **Historial de estados**: cada cambio de estado del expediente con su fecha y su origen; el primero
  es REGISTRADO.
- **Auditoría del expediente**: cada operación importante (presentar, registrar, ver el detalle) con
  el usuario o el canal y la fecha, sin datos personales.
- **Evento de dominio "solicitud presentada"**: aviso que queda listo para la funcionalidad de
  notificaciones (008).
- **Receta** (de la 003): licencia elegida, con sus requisitos, ruta, tasa y plazo.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Una persona que nunca hizo el trámite identifica su licencia, confirma su identidad y
  presenta la solicitud desde el celular en 15 minutos o menos, sin ayuda (EQ-05; propuesta por
  validar: el 90 % de los participantes).
- **SC-002**: El 95 % de las consultas del estado responde en 2 segundos o menos, con menos del 1 % de
  errores, con 1,000 usuarios simultáneos (EQ-01).
- **SC-003**: El 100 % de los intentos no autorizados probados se rechaza sin modificar datos:
  presentar sin identidad confirmada o con el permiso vencido, registrar en mesa de partes o abrir la
  bandeja sin el rol adecuado, y consultar un expediente con un DNI/RUC ajeno (EQ-04).
- **SC-004**: La consulta pública y la verificación de identidad se bloquean en el 6.º intento fallido
  dentro de 15 minutos en el 100 % de las pruebas de fuerza bruta (EQ-04).
- **SC-005**: Ningún dato personal aparece en las direcciones, en los registros del sistema ni en los
  mensajes de error durante las pruebas de seguridad (EQ-04, Ley N.° 29733).
- **SC-006**: Para cada una de las 9 licencias, el formulario pide exactamente los documentos de su
  receta, ni uno más ni uno menos: los de condición "siempre" como obligatorios, la carta poder como
  obligatoria solo con representante, y los de giro especial y planos como opcionales.
- **SC-007**: En el 100 % de las pruebas de doble envío o reintento, se crea un solo expediente.
- **SC-008**: El 100 % de los archivos de tipo no permitido probados (incluidos los renombrados) y de
  los mayores de 10 MB se rechaza al subirlos.
- **SC-009**: Las pantallas de esta funcionalidad obtienen 90 o más en accesibilidad y en buenas
  prácticas en la auditoría de calidad para celular, sin desplazamiento horizontal a 360 px.
- **SC-010**: El personal de mesa de partes registra una solicitud presencial completa en 10 minutos o
  menos, con los documentos ya digitalizados.

## Supuestos

- **Servicio de identificación simulado**: el servicio real de DNI/RUC no está contratado. En la
  Fase 1 se usa uno simulado con datos ficticios, que responde "coincide", "no coincide" o "no
  disponible", y se reemplaza después por el real sin cambiar las reglas.
- **Envío del código**: el código al celular usa el mismo envío simulado de la 002 en desarrollo; el
  envío real por SMS es parte de la integración con el proveedor.
- **El RUC siempre se pide**: el TUPA pide RUC y DNI o carné de extranjería también a personas
  naturales (diferencia D2 del documento 09, ya aplicada al diseño).
- **Pago después de presentar**: se mantiene el diseño actual (la esquela se genera al confirmar el
  riesgo, 005 y 006) mientras la Municipalidad no responda la duda N.° 1 del documento 09 sobre pagar
  antes de presentar.
- **Giro y zona**: el giro y la zona se escriben como texto (sin catálogo de giros ni de zonas en esta
  funcionalidad); la zona se usará después en los reportes (RF18).
- **Requisitos condicionales distintos del representante**: el sistema no puede comprobar si el giro
  es especial o si hay planos de los últimos 5 años, así que esos documentos se muestran como
  opcionales con su explicación (aclaración 3); el evaluador decide si faltan (006).
- **Licencias, no trámites conectados**: solo se presentan las 9 licencias del catálogo; los
  trámites conectados (transferencia, cambio de giro, duplicado) son trabajo futuro (HU12, RF15).
- **Notificaciones y plazos**: los avisos al administrado y el vencimiento del plazo en días hábiles
  son de la funcionalidad 008; aquí solo se deja el evento y el campo vacío.
- **Subsanación y evaluación**: subsanar observaciones (CU05) y evaluar el expediente son de la
  funcionalidad 006.
- **Identificación en la consulta**: se acepta el DNI, el carné de extranjería o el RUC del titular;
  no se acepta el documento del representante.
- **Metas por validar**: las medidas de EQ-01 y EQ-05 son propuestas por validar con la
  Municipalidad y rigen tal como están (constitución, principio VI).
