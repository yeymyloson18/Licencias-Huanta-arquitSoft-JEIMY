# Especificación de funcionalidad: Mi perfil del personal y pantalla de inicio por rol

**Rama de la funcionalidad**: `011-mi-perfil-inicio-rol`

**Creada**: 2026-11-24

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Mi perfil del personal y pantalla de inicio por rol. Hoy el
menú del personal solo muestra el nombre y 'Cerrar sesión': nadie puede ver sus propios datos ni
cambiar su clave cuando quiera (solo se cambia cuando es temporal). Además, al ingresar, todos los
roles menos el administrador llegan a la página pública de inicio en lugar de a su trabajo. Se pide:
(1) un botón 'Mi perfil' en el menú, junto al nombre, para cualquier usuario del personal con sesión;
(2) una pantalla de perfil que muestre solo los datos de quien inició sesión: nombre completo,
correo, celular enmascarado (9*****321), sus roles con su nombre en pantalla, su último ingreso y
cuántas sesiones tiene abiertas; nunca la clave ni el código; (3) un botón 'Cambiar mi clave' que
pida la clave actual y la nueva dos veces, con las mismas reglas de clave de la 002 y su registro en
la auditoría de seguridad; (4) que al ingresar cada rol llegue a su pantalla principal: administrador
al panel, mesa de partes y evaluador a Expedientes, caja a Caja, inspector a Inspecciones, jefatura
al Tablero; con varios roles, al primero según ese orden. Nadie puede ver el perfil de otra persona;
los datos personales no van en la URL ni en los registros. El administrado no tiene perfil porque no
tiene cuenta. Debe cumplir la constitución: contrato OpenAPI primero, Clean Architecture, pruebas de
permisos y de privacidad, y accesibilidad a 360 px."

**Amplía**: la 002 (sesión del personal, política de clave y cambio de clave temporal) y la 009
(panel del administrador, ficha del usuario y auditoría de seguridad).

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Llegar a mi pantalla de trabajo al ingresar (Prioridad: P1)

Al completar el ingreso en dos pasos (o al terminar de cambiar una clave temporal), cada persona del
personal llega directamente a la pantalla principal de su rol, no a la página pública de inicio:
administrador al panel, mesa de partes y evaluador a Expedientes, caja a Caja, inspector a
Inspecciones y jefatura al Tablero. Si tiene varios roles, llega a la pantalla del primero según ese
orden.

**Por qué esta prioridad**: hoy cinco de los seis roles caen en la página pública y deben buscar su
trabajo en el menú en cada ingreso; es el arreglo con más efecto diario y el más simple.

**Prueba independiente**: ingresar con un usuario de cada rol y con un usuario de varios roles, y
comprobar la pantalla a la que llega cada uno.

**Escenarios de aceptación**:

1. **Dado** un usuario con solo el rol Caja, **cuando** completa el ingreso, **entonces** llega a la
   pantalla de Caja.
2. **Dado** un usuario con solo el rol Mesa de partes o solo Evaluador, **cuando** completa el
   ingreso, **entonces** llega a Expedientes.
3. **Dado** un usuario con solo el rol Inspector, **cuando** completa el ingreso, **entonces** llega a
   Inspecciones; **y** con solo Jefatura, llega al Tablero; **y** con Administrador, al panel.
4. **Dado** un usuario con los roles Inspector y Caja, **cuando** completa el ingreso, **entonces**
   llega a Caja (Caja va antes que Inspector en el orden).
5. **Dado** un usuario con clave temporal, **cuando** termina de cambiarla, **entonces** llega a la
   pantalla principal de su rol con el aviso "Su clave se cambió".
6. **Dado** un usuario que intentó abrir una pantalla protegida sin sesión y fue enviado a ingresar,
   **cuando** completa el ingreso, **entonces** vuelve a la pantalla que intentaba abrir, si su rol la
   permite; si no, llega a la pantalla principal de su rol.
7. **Dado** un usuario del personal con sesión en cualquier pantalla, **cuando** quiere volver a su
   pantalla principal, **entonces** usa la opción de su rol en el menú (por ejemplo, Caja usa "Caja";
   sin roles, "Mi perfil"); el menú no tiene "Inicio" ni ningún enlace al portal público del
   ciudadano; **y** si escribe a mano la dirección del portal público, la página se abre igual
   (FR-020).
8. **Dado** una persona del personal sin sesión en la portada o en otra página pública, **cuando**
   busca cómo entrar, **entonces** ve el enlace "Acceso del personal", que la lleva a la pantalla de
   ingreso; **y** con sesión ese enlace no aparece (FR-021).

---

### Historia de usuario 2 - Ver mi perfil (Prioridad: P1)

Cualquier persona del personal con sesión ve en el menú, junto a su nombre, el botón "Mi perfil". Al
pulsarlo ve solo sus propios datos: nombre completo, correo, celular enmascarado (`9*****321`), sus
roles con su nombre en pantalla (por ejemplo, "Mesa de partes"), la fecha y hora de su último
ingreso y cuántas sesiones tiene abiertas. Nunca ve su clave ni ningún código.

**Por qué esta prioridad**: es la base del pedido: hoy nadie puede comprobar con qué correo, celular
o roles figura en el sistema sin pedírselo al administrador.

**Prueba independiente**: ingresar con un usuario de cada rol, pulsar "Mi perfil" y comprobar que
los datos coinciden con los de su cuenta y que no aparece la clave, ningún código ni el celular
completo.

**Escenarios de aceptación**:

1. **Dado** un usuario del personal con sesión, **cuando** abre el menú, **entonces** ve el botón
   "Mi perfil" junto a su nombre, sea cual sea su rol.
2. **Dado** un usuario con celular 987654321, **cuando** abre "Mi perfil", **entonces** ve su nombre
   completo, su correo, el celular `9*****321`, sus roles con su nombre en pantalla, su último
   ingreso y el número de sesiones abiertas.
3. **Dado** un usuario que ingresó desde la computadora y desde el celular, **cuando** abre "Mi
   perfil", **entonces** ve "2 sesiones abiertas".
4. **Dado** cualquier perfil, **cuando** se revisa la pantalla, la respuesta del servidor, la
   dirección del navegador y los registros de la aplicación, **entonces** no aparecen la clave, ningún
   código, el celular completo ni otro dato personal en la dirección ni en los registros.
5. **Dado** un visitante sin sesión (incluido un administrado), **cuando** intenta abrir "Mi perfil",
   **entonces** es enviado a la pantalla de ingreso y no ve ningún dato.

---

### Historia de usuario 3 - Cambiar mi clave cuando quiera (Prioridad: P2)

Desde "Mi perfil", el botón "Cambiar mi clave" lleva a un formulario que pide la clave actual y la
nueva dos veces. La nueva clave cumple las mismas reglas de la 002 (al menos 12 caracteres, con
letras y números, distinta de la actual). El cambio queda en la auditoría de seguridad como "Clave
cambiada", igual que el cambio de clave temporal.

**Por qué esta prioridad**: hoy la clave solo se cambia cuando es temporal; si alguien sospecha que
otra persona la conoce, depende del administrador. Es importante, pero el formulario y sus reglas ya
existen y solo hay que abrirlos a cualquier momento.

**Prueba independiente**: desde "Mi perfil", cambiar la clave con datos correctos, con la clave
actual equivocada, con una clave nueva que no cumple las reglas y con dos claves nuevas distintas;
comprobar cada resultado y el evento en la auditoría.

**Escenarios de aceptación**:

1. **Dado** un usuario con clave definitiva, **cuando** pulsa "Cambiar mi clave" en su perfil,
   **entonces** ve un formulario con "Clave actual", "Clave nueva" y "Repita la clave nueva".
2. **Dado** el formulario lleno con la clave actual correcta y una clave nueva válida escrita dos
   veces igual, **cuando** lo envía, **entonces** la clave cambia, la anterior deja de servir, vuelve a
   "Mi perfil" con el aviso "Su clave se cambió" y la auditoría de seguridad registra "Clave
   cambiada" sobre su cuenta, con él mismo como actor.
3. **Dado** que las dos claves nuevas no coinciden, **cuando** envía el formulario, **entonces** ve
   "Las claves nuevas no coinciden" y nada se envía ni cambia.
4. **Dado** una clave nueva que no cumple las reglas o es igual a la actual, **cuando** envía el
   formulario, **entonces** ve qué regla no cumple, junto al campo, y la clave no cambia.
5. **Dado** una clave actual incorrecta, **cuando** envía el formulario, **entonces** ve "La clave
   actual no es correcta"; el intento cuenta para el límite de 5 intentos fallidos en 15 minutos de la
   002 y, al alcanzarlo, ve "Demasiados intentos. Vuelva a intentarlo más tarde."
6. **Dado** un usuario con 2 sesiones abiertas, **cuando** cambia su clave desde una de ellas,
   **entonces** la otra sesión se cierra, la actual sigue abierta y su perfil muestra "1 sesión
   abierta".
7. **Dado** un usuario que todavía tiene clave temporal, **cuando** abre cualquier pantalla,
   **entonces** sigue siendo enviado primero al cambio obligatorio de la 002, sin cambios en ese flujo.

---

### Historia de usuario 4 - Nadie ve el perfil de otra persona (Prioridad: P1)

El perfil solo muestra los datos de quien inició sesión. No existe forma de pedir el perfil de otra
persona: ni cambiando la dirección del navegador ni enviando otro identificador al servidor. El
administrador sigue viendo los datos de los demás solo en su ficha de usuario (009), no en "Mi
perfil".

**Por qué esta prioridad**: es un requisito de privacidad (Ley N.° 29733); un perfil que dejara ver
los de otros sería una filtración de datos personales.

**Prueba independiente**: con dos usuarios, intentar obtener el perfil del otro por todas las vías
posibles y comprobar que siempre se recibe el propio o un rechazo.

**Escenarios de aceptación**:

1. **Dado** el usuario A con sesión, **cuando** pide su perfil agregando el identificador del usuario
   B en la dirección o en la petición, **entonces** recibe solo su propio perfil o un rechazo; nunca
   datos de B.
2. **Dado** el usuario A con sesión, **cuando** intenta cambiar la clave de B desde el formulario de
   "Cambiar mi clave", **entonces** solo puede cambiar la suya.
3. **Dado** una sesión vencida o cerrada, **cuando** se pide el perfil, **entonces** se rechaza como
   "sin sesión" y no se muestra ningún dato.

---

### Casos límite

- **Usuario sin roles activos**: si el administrador le quitó todos los roles, al ingresar llega a
  "Mi perfil" (la única pantalla a la que tiene acceso) con el mensaje "Todavía no tiene un rol
  asignado. Consulte con el administrador."; su perfil muestra "Sin roles".
- **Primer ingreso**: el último ingreso mostrado es el de la sesión actual; si no hay ninguno
  registrado, se muestra "Sin registro".
- **Roles cambiados durante la sesión**: el perfil muestra los roles vigentes al momento de abrirlo,
  no los que tenía al ingresar.
- **Usuario desactivado durante la sesión**: su siguiente pedido del perfil se rechaza como sin
  sesión (regla de la 002).
- **Límite de intentos no disponible**: el cambio de clave voluntario se comporta igual que el
  cambio de clave temporal de la 002 (sigue funcionando, porque ya exige una sesión válida).
- **Celular con formato inesperado**: se enmascara siempre con el primer dígito y los 3 últimos;
  nunca se muestra completo.
- **Pantalla de 360 px**: el botón "Mi perfil", el perfil y el formulario se usan sin
  desplazamiento horizontal y con el teclado.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Menú y perfil**

- **FR-001**: El menú del personal DEBE mostrar, junto al nombre de quien tiene sesión, un botón "Mi
  perfil" visible para cualquier rol, además de "Cerrar sesión".
- **FR-002**: El sistema DEBE ofrecer una pantalla "Mi perfil" que muestre, de quien inició sesión:
  nombre completo, correo, celular enmascarado (primer dígito y los 3 últimos, `9*****321`), sus
  roles vigentes con su nombre en pantalla, la fecha y hora de su último ingreso correcto y el
  número de sesiones abiertas.
- **FR-003**: El perfil NUNCA DEBE mostrar ni entregar la clave (ni su huella), ningún código de 6
  dígitos, el celular completo ni datos de otra persona.
- **FR-004**: El perfil DEBE obtenerse únicamente a partir de la sesión de quien lo pide; el sistema
  NO DEBE aceptar ningún identificador de usuario para elegir de quién es el perfil.
- **FR-005**: Pedir el perfil sin sesión válida DEBE rechazarse como "sin sesión"; el portal envía a
  la pantalla de ingreso.
- **FR-006**: La pantalla "Mi perfil" DEBE estar disponible para todo usuario del personal con
  sesión, incluso sin roles; un usuario con clave temporal sigue siendo enviado primero al cambio
  obligatorio de la 002.

**Cambio de clave voluntario**

- **FR-007**: "Mi perfil" DEBE tener un botón "Cambiar mi clave" que abra un formulario con clave
  actual, clave nueva y repetición de la clave nueva.
- **FR-008**: El portal DEBE comprobar que las dos claves nuevas coinciden antes de enviarlas; si no
  coinciden, muestra "Las claves nuevas no coinciden" y no envía nada.
- **FR-009**: El cambio voluntario DEBE aplicar exactamente las reglas del cambio de la 002: clave
  actual correcta, política mínima (al menos 12 caracteres, con letras y números), distinta de la
  actual, límite de 5 intentos fallidos en 15 minutos, cierre de las demás sesiones del usuario y
  continuidad de la sesión actual.
- **FR-010**: Cada cambio de clave voluntario DEBE registrarse en la auditoría de seguridad como
  "Clave cambiada" sobre la cuenta, con el propio usuario como actor, en la misma operación que el
  cambio, sin la clave nueva ni la anterior.
- **FR-011**: Tras un cambio voluntario correcto, el portal DEBE volver a "Mi perfil" con el aviso
  "Su clave se cambió".

**Pantalla de inicio por rol**

- **FR-012**: Al completar el ingreso, o al terminar el cambio obligatorio de una clave temporal, el
  portal DEBE llevar a cada persona a la pantalla principal de su rol: Administrador → panel; Mesa
  de partes → Expedientes; Evaluador → Expedientes; Caja → Caja; Inspector → Inspecciones; Jefatura
  → Tablero.
- **FR-013**: Con varios roles, el portal DEBE elegir el primero según este orden: Administrador,
  Mesa de partes, Evaluador, Caja, Inspector, Jefatura.
- **FR-014**: Sin roles activos, el portal DEBE llevar a "Mi perfil" con el mensaje "Todavía no
  tiene un rol asignado. Consulte con el administrador."
- **FR-015**: Si la persona fue enviada a ingresar al intentar abrir una pantalla protegida, después
  de ingresar el portal DEBE devolverla a esa pantalla cuando su rol la permite; si no, aplica
  FR-012.
- **FR-020**: El menú del personal NO DEBE tener un enlace "Inicio": la pantalla principal de cada
  rol ya es una opción propia del menú (Administrador → "Panel"; Mesa de partes y Evaluador →
  "Expedientes"; Caja → "Caja"; Inspector → "Inspecciones"; Jefatura → "Tablero"; sin roles →
  "Mi perfil"), y un "Inicio" solo la repetiría. Al ingresar, cada persona sigue llegando a su
  pantalla principal con la regla de FR-012 a FR-014 (`inicioDe(roles)`). El menú del personal NO
  DEBE enlazar al portal público del ciudadano (`/`, con el asistente y la consulta), porque ningún
  rol del personal hace ese trámite. Las páginas públicas siguen abiertas: no se bloquean ni
  redirigen para quien tiene sesión; solo no están en el menú del personal.
- **FR-021**: La portada (`/`) y las demás páginas públicas (asistente, consulta, verificación de
  licencias y trámite en línea) DEBEN mostrar un enlace discreto "Acceso del personal" que lleve a la
  pantalla de ingreso (`/ingresar`), visible solo cuando no hay sesión del personal. Con sesión no
  aparece, porque el menú ya lleva a su pantalla (FR-020). No aparece en la propia pantalla de
  ingreso ni mientras se comprueba si hay sesión. Se usa con el teclado y con lector de pantalla y
  cabe a 360 px sin desplazamiento horizontal.

**Privacidad, contrato y accesibilidad**

- **FR-016**: Ningún dato personal (nombre, correo, celular, clave o código) DEBE aparecer en la
  dirección del navegador ni en los registros de la aplicación al ver el perfil o cambiar la clave;
  los registros identifican a la persona solo por su identificador interno.
- **FR-017**: La consulta del perfil DEBE declararse en el contrato de la API antes de
  implementarse, con sus respuestas de éxito y de rechazo; el cambio de clave reutiliza la operación
  ya declarada en la 002.
- **FR-018**: El botón "Mi perfil", la pantalla del perfil y el formulario de cambio de clave DEBEN
  poder usarse con el teclado y con lector de pantalla, y verse completos en una pantalla de 360 px
  de ancho sin desplazamiento horizontal.
- **FR-019**: El administrado (ciudadano) NO tiene perfil: el botón "Mi perfil" solo aparece con
  sesión del personal y la pantalla no ofrece ningún dato a quien no tiene cuenta.

### Entidades clave

- **Perfil propio**: vista de solo lectura de la cuenta de quien tiene sesión: nombre completo,
  correo, celular enmascarado, roles vigentes (código y nombre en pantalla), último ingreso y número
  de sesiones abiertas. No se guarda aparte: se arma con la cuenta, sus sesiones y la auditoría de la
  002 y la 009.
- **Pantalla principal por rol**: correspondencia fija entre cada uno de los 6 roles y la pantalla a
  la que llega al ingresar, con un orden de prioridad para quien tiene varios roles.
- **Evento "Clave cambiada"**: evento ya existente de la auditoría de seguridad (009); ahora también
  lo genera el cambio voluntario.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: El 100 % de los usuarios de prueba de cada uno de los 6 roles, y de las combinaciones
  de varios roles, llega a la pantalla principal que le corresponde al ingresar; ninguno llega a la
  página pública de inicio.
- **SC-002**: Una persona del personal encuentra y abre su perfil en 1 clic desde cualquier pantalla
  con sesión, y ve sus datos en menos de 2 segundos.
- **SC-003**: Una persona cambia su clave desde su perfil en menos de 1 minuto.
- **SC-004**: En las pruebas de permisos, el 100 % de los intentos de ver el perfil de otra persona
  o de pedirlo sin sesión se rechaza o devuelve solo el perfil propio (0 datos ajenos).
- **SC-005**: En las pruebas de privacidad, las respuestas, las direcciones y los registros
  generados al ver el perfil y cambiar la clave contienen 0 claves, 0 códigos, 0 celulares completos
  y 0 datos personales en la dirección o en los registros.
- **SC-006**: El 100 % de los cambios de clave voluntarios correctos aparece en la auditoría de
  seguridad como "Clave cambiada"; los rechazados no cambian la clave.
- **SC-007**: El menú con "Mi perfil", la pantalla del perfil y el formulario de cambio de clave
  obtienen al menos 90 en accesibilidad en la revisión automática y se usan completos en 360 px sin
  desplazamiento horizontal (EQ-05).

## Escenarios de calidad afectados

- **EQ-04 (seguridad)**: perfil solo propio, datos personales fuera de la dirección y de los
  registros, límite de intentos en el cambio de clave; se comprueba con pruebas de permisos y de
  privacidad en la integración continua y con el análisis de OWASP ZAP sobre la nueva consulta.
- **EQ-05 (usabilidad y accesibilidad)**: menú, perfil y formulario a 360 px; se comprueba con
  Lighthouse y pruebas de la interfaz.
- **EQ-06 (mantenibilidad)**: la consulta del perfil vive en el módulo de Seguridad y Usuarios y
  respeta la regla de dependencia; se comprueba con dependency-cruiser.

## Supuestos

- La regla de la 002 sobre el cambio de clave (cerrar las demás sesiones y mantener la actual) se
  aplica igual al cambio voluntario; así, quien sospecha que alguien conoce su clave expulsa a esa
  persona al cambiarla.
- El orden de prioridad de roles es el pedido (Administrador, Mesa de partes, Evaluador, Caja,
  Inspector, Jefatura), aunque difiere del orden en que la 002 lista los roles.
- "Último ingreso" es el último ingreso correcto registrado en la auditoría de seguridad (el mismo
  dato que la ficha del usuario de la 009); puede ser el de la sesión actual.
- "Sesiones abiertas" cuenta las sesiones no cerradas ni vencidas, incluida la actual, con el mismo
  criterio de la ficha del usuario de la 009.
- El perfil es de solo lectura: cambiar nombre, correo, celular o roles sigue siendo tarea del
  administrador (002 y 009). Cerrar las demás sesiones a pedido queda fuera de esta funcionalidad.
- Ver el propio perfil no se registra en la auditoría de seguridad (no es una operación que cambie
  algo); solo el cambio de clave se registra.
- El correo se muestra completo porque es el dato con el que la persona ingresa y solo lo ve ella;
  el celular se enmascara porque el código se envía a ese número.
