# Especificación de funcionalidad: Seguridad y usuarios del personal municipal

**Rama de la funcionalidad**: `002-seguridad-usuarios`

**Creada**: 2026-11-17

**Estado**: Borrador

**Entrada**: Descripción de la usuaria: "Usa como entrada el archivo docs/sdd/002-seguridad-specify.md" (Funcionalidad 002: Seguridad y usuarios del personal municipal. Como personal municipal necesito iniciar sesión de forma segura, para que solo yo pueda hacer las operaciones de mi rol. Como administrador necesito crear usuarios, desactivarlos y asignarles roles, para que cada persona haga solo lo que le corresponde.)

**Cubre**: HU15, RF16, RF17 y RF22; escenario de calidad EQ-04 (seguridad); ADR-007; Ley N.° 29733.

## Aclaraciones

### Sesión 2026-11-17

- P: Cuando el administrador crea un usuario, ¿cómo recibe el usuario su clave y puede cambiarla? →
  R: El administrador define una clave temporal y la entrega en persona; en su primer inicio de
  sesión el usuario debe cambiarla antes de hacer cualquier otra operación. Así el administrador
  nunca conoce la clave definitiva.
- P: ¿Cuándo pierden efecto la desactivación de un usuario o la retirada de un rol? → R: En la
  siguiente operación protegida del usuario (inmediato), sin esperar a que venza su sesión corta.
- P: ¿Cuántos códigos por SMS puede pedir un mismo usuario? → R: Como máximo 3 códigos por usuario
  cada 15 minutos; el 4.º pedido se rechaza indicando cuándo reintentar. Es un límite propio,
  separado del límite de 5 intentos fallidos.
- P: Al quitar un rol, ¿se registra quién lo quitó y cuándo? → R: Sí, historial completo: cada
  asignación guarda quién la hizo y cuándo y, al retirarse, quién la retiró y cuándo; las asignaciones
  retiradas se conservan.
- P: ¿Cuánto dura una sesión del personal? → R: Como máximo 8 horas desde el inicio de sesión, y se
  cierra sola tras 30 minutos sin actividad.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Iniciar sesión en dos pasos (Prioridad: P1)

Una persona del personal municipal (mesa de partes, evaluador, inspector, caja, jefatura o
administrador) abre el portal desde su computadora o su celular, escribe su correo y su clave y, si
son correctos, recibe en su celular un código de 6 dígitos. Al escribir el código entra al sistema
con una sesión de corta duración, que el portal renueva mientras sigue trabajando y que ella puede
cerrar cuando termina.

**Por qué esta prioridad**: sin inicio de sesión no se puede proteger ninguna operación del
personal (aprobar expedientes, registrar pagos, cambiar el catálogo); es la puerta de entrada de
todos los módulos que siguen.

**Prueba independiente**: con un usuario de prueba activo, iniciar sesión desde el portal con correo,
clave y el código recibido; comprobar que entra, que la sesión se renueva sola mientras trabaja y que,
al cerrar sesión, ya no puede seguir usando esa sesión.

**Escenarios de aceptación**:

1. **Dado** un usuario activo, **cuando** escribe su correo y su clave correctos, **entonces** el
   sistema le envía un código de 6 dígitos a su celular y le pide escribirlo, mostrando el celular
   de destino enmascarado (por ejemplo, `9*****321`).
2. **Dado** que el usuario recibió el código hace menos de 5 minutos, **cuando** lo escribe
   correctamente, **entonces** entra al sistema con una sesión de corta duración y el portal muestra
   su nombre y las opciones de sus roles.
3. **Dado** un código enviado hace más de 5 minutos, o un código que ya acumuló 5 intentos fallidos,
   **cuando** el usuario lo escribe, **entonces** el sistema lo rechaza y le indica que debe pedir un
   código nuevo.
4. **Dado** un código ya usado para entrar, **cuando** alguien lo vuelve a escribir, **entonces** el
   sistema lo rechaza.
5. **Dado** un usuario con sesión iniciada, **cuando** su sesión de corta duración está por vencer y
   él sigue trabajando, **entonces** la sesión se renueva sin pedirle de nuevo correo, clave ni
   código, hasta el límite de la jornada (8 horas); **y si** pasa 30 minutos sin actividad, la sesión
   se cierra y debe volver a iniciar sesión.
6. **Dado** un usuario con sesión iniciada, **cuando** cierra sesión, **entonces** la sesión ya no se
   puede renovar y el portal vuelve a la pantalla de inicio de sesión.
7. **Dado** un correo que no existe, una clave incorrecta o un código incorrecto, **cuando** se
   intenta entrar, **entonces** el mensaje es el mismo en los tres casos y no revela cuál dato falló.
8. **Dado** un usuario que todavía tiene la clave temporal que le asignó el administrador, **cuando**
   completa los dos pasos, **entonces** el portal le pide definir su nueva clave antes de mostrarle
   cualquier otra opción, y ninguna operación protegida se le permite hasta que la cambie.
9. **Dado** un usuario que está cambiando su clave temporal, **cuando** escribe una clave nueva que no
   cumple la política o que es igual a la temporal, **entonces** el sistema la rechaza indicando qué
   regla no cumple; **y cuando** la nueva clave es válida, queda guardada, la temporal deja de servir
   y el usuario continúa con su sesión.

---

### Historia de usuario 2 - Control de permisos por rol en las operaciones protegidas (Prioridad: P1)

Cada módulo del sistema (Trámites, Pagos en caja, Catálogo, Inspecciones, Licencias y los demás)
marca qué roles pueden hacer cada operación protegida. El sistema rechaza a quien no tiene sesión y a
quien tiene un rol insuficiente, sin modificar datos ni mostrar información sensible (EQ-04).

**Por qué esta prioridad**: es el corazón del escenario EQ-04 y lo reutilizarán todos los módulos
siguientes; sin él, cualquier persona con sesión podría, por ejemplo, registrar pagos sin ser de caja.

**Prueba independiente**: con una operación protegida de prueba que solo admite un rol, intentar
usarla sin sesión, con una sesión de otro rol y con una sesión del rol correcto, y comprobar las tres
respuestas.

**Escenarios de aceptación**:

1. **Dado** una operación protegida, **cuando** alguien la intenta sin sesión válida (sin sesión, con
   una sesión vencida, cerrada o alterada), **entonces** el sistema responde "no autenticado" y no
   modifica ningún dato.
2. **Dado** una operación protegida que solo admite el rol caja, **cuando** la intenta un usuario con
   sesión válida que solo tiene el rol evaluador, **entonces** el sistema responde "sin permiso" y no
   modifica ningún dato.
3. **Dado** un usuario con los roles evaluador y jefatura, **cuando** intenta una operación que admite
   jefatura, **entonces** el sistema la permite (basta con tener uno de los roles admitidos).
4. **Dado** un usuario con sesión abierta, **cuando** el administrador lo desactiva, **entonces** su
   siguiente operación protegida responde "no autenticado" y su sesión ya no se puede renovar.
5. **Dado** un usuario con sesión abierta, **cuando** el administrador le quita un rol, **entonces** su
   siguiente operación que requería ese rol responde "sin permiso".

---

### Historia de usuario 3 - Primer administrador al instalar el sistema (Prioridad: P1)

Quien instala el sistema en un entorno nuevo (desarrollo, pruebas o producción) crea el primer
administrador con un paso de instalación que recibe su correo, nombre, celular y clave en ese momento,
sin que ninguna clave real quede escrita en el repositorio. A partir de ahí, ese administrador crea a
los demás usuarios desde el portal.

**Por qué esta prioridad**: sin un primer administrador nadie puede entrar ni crear usuarios; el
sistema quedaría inutilizable después de instalarlo.

**Prueba independiente**: en una instalación nueva sin usuarios, ejecutar el paso de instalación con
datos de prueba y comprobar que ese administrador puede iniciar sesión; volver a ejecutarlo y comprobar
que no crea un segundo administrador.

**Escenarios de aceptación**:

1. **Dado** una instalación sin ningún administrador activo, **cuando** se ejecuta el paso de
   instalación con los datos del primer administrador, **entonces** se crea un usuario activo con el
   rol administrador que puede iniciar sesión en dos pasos.
2. **Dado** una instalación que ya tiene un administrador activo, **cuando** se vuelve a ejecutar el
   paso de instalación, **entonces** no se crea ni modifica ningún usuario y se informa que ya existe
   un administrador.
3. **Dado** el repositorio del proyecto, **cuando** se revisa en busca de secretos, **entonces** no
   contiene la clave de ningún administrador ni de ningún otro usuario real.

---

### Historia de usuario 4 - Bloqueo temporal ante intentos fallidos (Prioridad: P2)

Si alguien prueba claves o códigos al azar, el sistema bloquea temporalmente el inicio de sesión
después de 5 intentos fallidos en 15 minutos e informa cuándo se puede volver a intentar, sin revelar
qué dato era incorrecto.

**Por qué esta prioridad**: protege contra la adivinación de claves y códigos (EQ-04: bloqueo en el
6.º intento); se apoya en el inicio de sesión de la historia 1, que debe existir primero.

**Prueba independiente**: con un usuario de prueba, fallar la clave 5 veces seguidas y comprobar que
el 6.º intento (aunque sea correcto) se rechaza indicando la hora de reintento; esperar a que termine
el bloqueo y comprobar que puede entrar.

**Escenarios de aceptación**:

1. **Dado** un correo con 5 intentos fallidos (de clave o de código) en los últimos 15 minutos,
   **cuando** se hace el 6.º intento, aunque los datos sean correctos, **entonces** el sistema lo
   rechaza e indica a partir de qué hora se puede reintentar.
2. **Dado** un origen de conexión con 5 intentos fallidos en 15 minutos contra distintos correos,
   **cuando** hace un nuevo intento, **entonces** también queda bloqueado temporalmente.
3. **Dado** un bloqueo vigente, **cuando** termina el tiempo de bloqueo, **entonces** el usuario puede
   iniciar sesión con normalidad.
4. **Dado** un correo que no existe, **cuando** se intenta entrar con él 6 veces, **entonces** el
   sistema responde igual que con un correo existente (incluido el bloqueo), de modo que no se puede
   averiguar qué correos están registrados.

---

### Historia de usuario 5 - Gestión de usuarios y roles por el administrador (Prioridad: P2)

El administrador abre la pantalla de usuarios del portal (también desde su celular), ve la lista del
personal con sus roles y su estado, crea usuarios nuevos, corrige su nombre o celular, los desactiva o
reactiva y les asigna o quita roles. El sistema registra quién asignó cada rol y cuándo, y nunca deja
a la Municipalidad sin un administrador activo.

**Por qué esta prioridad**: permite incorporar al personal sin tocar la base de datos; mientras tanto,
el primer administrador (historia 3) puede operar solo, por eso va después de las historias P1.

**Prueba independiente**: iniciar sesión como administrador, crear un usuario con los roles evaluador e
inspector, comprobar que ese usuario puede entrar, desactivarlo y comprobar que ya no puede; intentar
quitarle el rol administrador al único administrador activo y comprobar que el sistema lo impide.

**Escenarios de aceptación**:

1. **Dado** un administrador con sesión, **cuando** abre la gestión de usuarios, **entonces** ve la
   lista del personal con nombre, correo, roles y estado (activo o inactivo), y puede buscar por un
   fragmento del nombre o por el correo completo.
2. **Dado** un administrador, **cuando** crea un usuario con correo, nombre, celular, clave temporal y
   uno o más roles, **entonces** el usuario queda activo, puede iniciar sesión en dos pasos (y debe
   cambiar la clave temporal al entrar) y queda registrado quién le asignó cada rol y cuándo.
3. **Dado** un correo que ya pertenece a otro usuario, **cuando** el administrador intenta crear un
   usuario con ese correo, **entonces** el sistema lo rechaza indicando que el correo ya está en uso.
4. **Dado** un usuario existente, **cuando** el administrador cambia su nombre, su celular o su estado
   activo, **entonces** el cambio se guarda; el correo no se puede cambiar.
5. **Dado** un usuario existente, **cuando** el administrador le asigna un rol nuevo, **entonces** se
   registra quién lo asignó y cuándo; **y cuando** le quita un rol, ese rol deja de valer desde su
   siguiente operación y queda registrado quién lo retiró y cuándo, sin borrar la asignación
   anterior.
6. **Dado** que solo queda un administrador activo, **cuando** alguien intenta desactivarlo o quitarle
   el rol administrador (incluido él mismo), **entonces** el sistema lo impide y explica que debe
   existir al menos un administrador activo.
7. **Dado** un usuario sin el rol administrador, **cuando** intenta abrir la gestión de usuarios o
   usar cualquiera de sus operaciones, **entonces** el sistema responde "sin permiso".
8. **Dado** un usuario desactivado, **cuando** el administrador lo reactiva, **entonces** puede volver
   a iniciar sesión con su clave y sus roles anteriores.
9. **Dado** un usuario que olvidó su clave, **cuando** el administrador le asigna una nueva clave
   temporal, **entonces** la clave anterior deja de servir, sus sesiones abiertas se invalidan y en su
   siguiente inicio de sesión debe cambiar la clave temporal.

---

### Casos límite

- **Código pedido varias veces**: si el usuario pide un código nuevo antes de usar el anterior, solo
  vale el último. Como máximo se envían 3 códigos por usuario cada 15 minutos (FR-002a); pedir un
  código no cuenta como intento fallido.
- **Celular sin señal o envío fallido**: si el envío del código falla, el usuario ve un mensaje que le
  permite pedir otro código, sin revelar datos del celular; el intento no se cuenta como fallido por
  culpa del usuario.
- **Usuario desactivado que intenta entrar**: recibe el mismo mensaje genérico que un dato incorrecto
  (no se revela que la cuenta existe pero está inactiva).
- **Sesión abierta en varios dispositivos**: cada dispositivo tiene su propia sesión; cerrar sesión en
  uno no cierra los otros; desactivar al usuario invalida todas.
- **Renovación con una sesión ya cerrada o robada**: intentar renovar con una renovación ya cerrada o
  ya usada se rechaza como "no autenticado".
- **Administrador que se desactiva a sí mismo**: está permitido solo si queda al menos otro
  administrador activo; su sesión deja de servir en su siguiente operación.
- **Dos administradores que se quitan el rol al mismo tiempo**: el sistema nunca debe terminar sin
  administradores activos, aunque las dos operaciones lleguen a la vez.
- **Celular con formato inválido**: al crear o editar un usuario, el sistema rechaza celulares que no
  tengan 9 dígitos empezando por 9 (formato de celular del Perú), indicando el campo, sin repetir el
  valor en el mensaje.
- **Proveedor de SMS no contratado**: el sistema funciona con el envío simulado; en desarrollo y
  pruebas el código se puede consultar por un medio solo disponible en esos entornos y nunca en los
  registros; en producción el envío simulado no puede quedar activo.
- **Datos personales en errores**: ningún mensaje de error, registro o dirección web contiene correo,
  celular, clave ni código, ni siquiera cuando el error es por un dato mal escrito.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Inicio de sesión y sesiones**

- **FR-001**: El sistema DEBE autenticar al personal municipal en dos pasos: primero correo y clave;
  si son correctos, envía un código de 6 dígitos al celular registrado del usuario (RF16).
- **FR-002**: El código DEBE vencer a los 5 minutos de enviado, admitir como máximo 5 intentos y
  servir una sola vez; pedir un código nuevo invalida el anterior.
- **FR-002a**: El sistema DEBE enviar como máximo 3 códigos por usuario cada 15 minutos; el 4.º pedido
  se rechaza, sin enviar SMS, indicando a partir de qué momento se puede pedir otro. Este límite es
  independiente del límite de intentos fallidos (FR-006) y la respuesta no revela si el correo existe.
- **FR-003**: Con el código correcto, el sistema DEBE abrir una sesión de corta duración (15 minutos)
  que se puede renovar sin repetir los dos pasos hasta un máximo de 8 horas desde el inicio de sesión
  (una jornada laboral); pasado ese máximo, el usuario debe volver a iniciar sesión.
- **FR-003a**: La sesión DEBE cerrarse sola tras 30 minutos sin actividad del usuario, medida así:
  el portal cierra la sesión cuando pasan 30 minutos sin que el usuario use el teclado, toque la
  pantalla o haga clic, y lo lleva a la pantalla de inicio de sesión; el sistema rechaza renovar la
  sesión si pasaron más de 30 minutos desde su última renovación, aunque no se haya llegado a las
  8 horas.
- **FR-004**: El usuario DEBE poder cerrar sesión; al cerrarla, esa sesión deja de servir al instante:
  ya no se puede renovar y su siguiente operación protegida responde "no autenticado".
- **FR-005**: Los mensajes de error del inicio de sesión DEBEN ser iguales para correo inexistente,
  clave incorrecta, código incorrecto y usuario desactivado, sin indicar qué dato falló.

**Bloqueo por intentos fallidos**

- **FR-006**: Cinco intentos fallidos en 15 minutos (de clave o de código, sumados) para un mismo
  correo DEBEN bloquear temporalmente el inicio de sesión de ese correo durante 15 minutos; el 6.º
  intento se rechaza aunque los datos sean correctos.
- **FR-007**: Cinco intentos fallidos en 15 minutos desde un mismo origen de conexión DEBEN bloquearlo
  temporalmente de la misma forma, aunque use distintos correos (ADR-007).
- **FR-008**: Durante un bloqueo, el sistema DEBE indicar a partir de qué momento se puede reintentar,
  sin decir si falló el correo, la clave o el código; los correos inexistentes se tratan igual que los
  existentes.
- **FR-009**: Los contadores de intentos y los bloqueos DEBEN ser los mismos para todas las instancias
  del sistema, de modo que repartir los intentos entre instancias no evite el bloqueo.

**Usuarios desactivados**

- **FR-010**: Un usuario desactivado NO DEBE poder iniciar sesión.
- **FR-011**: Al desactivar un usuario, todas sus sesiones abiertas DEBEN dejar de servir desde su
  siguiente operación protegida y ya no se pueden renovar.

**Control de permisos por rol**

- **FR-012**: El sistema DEBE ofrecer un control de permisos por rol que todos los módulos puedan
  reutilizar para declarar qué roles admite cada operación protegida (RF17). Los roles son: mesa de
  partes, evaluador, inspector, caja, jefatura y administrador.
- **FR-013**: Una operación protegida DEBE responder "no autenticado" cuando no hay sesión válida (sin
  sesión, vencida, cerrada, alterada o de un usuario desactivado) y "sin permiso" cuando el usuario no
  tiene ninguno de los roles admitidos (EQ-04). En ambos casos no se modifica ningún dato ni se
  muestra información sensible.
- **FR-014**: Un usuario con varios roles DEBE poder hacer las operaciones de cualquiera de ellos.
- **FR-015**: Los cambios de roles DEBEN valer desde la siguiente operación del usuario afectado, sin
  esperar a que cierre sesión.

**Gestión de usuarios (administrador)**

- **FR-016**: El administrador DEBE poder listar los usuarios del personal (nombre, correo, roles y
  estado) y buscarlos por un fragmento del nombre o por el correo completo (RF22).
- **FR-017**: El administrador DEBE poder crear usuarios con correo, nombre completo, celular, clave
  temporal y uno o más roles. El correo DEBE ser único y no se puede cambiar después.
- **FR-018**: El administrador DEBE poder editar el nombre, el celular y el estado activo de un
  usuario, y asignarle o quitarle roles. Un usuario puede tener varios roles a la vez.
- **FR-019**: El sistema DEBE conservar el historial de asignaciones de roles: para cada asignación,
  quién la hizo y cuándo; al quitar un rol, quién lo retiró y cuándo. Las asignaciones retiradas no se
  borran y permiten saber qué roles tenía un usuario en una fecha dada; volver a asignar un rol
  retirado crea una asignación nueva.
- **FR-020**: El sistema NO DEBE permitir quedar sin ningún administrador activo: rechaza desactivar o
  quitar el rol administrador al último administrador activo, incluso si es el propio usuario y
  aunque dos operaciones lleguen al mismo tiempo.
- **FR-021**: Toda operación de gestión de usuarios DEBE estar disponible solo para el rol
  administrador.
- **FR-022**: La clave que define el administrador al crear un usuario DEBE ser temporal: el
  administrador la entrega en persona y, en el primer inicio de sesión, el usuario DEBE cambiarla
  antes de que se le permita cualquier operación protegida; mientras no la cambie, toda operación
  protegida responde "sin permiso" indicando que debe cambiar su clave.
- **FR-022a**: Toda clave (temporal o definitiva) DEBE cumplir una política mínima: al menos 12
  caracteres, con letras y números; la clave nueva no puede ser igual a la temporal.
- **FR-022b**: El administrador DEBE poder asignar una nueva clave temporal a un usuario que olvidó
  la suya; la clave anterior deja de servir, las sesiones abiertas del usuario se invalidan y en su
  siguiente inicio de sesión debe cambiarla (sustituye a la recuperación por correo, que queda fuera
  de alcance).

**Primer administrador**

- **FR-023**: El sistema DEBE ofrecer un paso de instalación que crea el primer administrador con
  datos entregados en ese momento (correo, nombre, celular y clave), sin que ninguna clave real quede
  guardada en el repositorio.
- **FR-024**: Si ya existe un administrador activo, el paso de instalación NO DEBE crear ni modificar
  usuarios, e informa que ya existe un administrador.

**Portal web**

- **FR-025**: El portal DEBE tener una pantalla de inicio de sesión en dos pasos (correo y clave;
  luego código), una pantalla para cambiar la clave temporal y una pantalla de gestión de usuarios
  para el administrador, todas usables desde un celular de 360 px de ancho sin desplazamiento
  horizontal y accesibles con teclado y lector de pantalla.
- **FR-026**: El portal DEBE mostrar al usuario con sesión solo las opciones de sus roles, renovar la
  sesión automáticamente mientras trabaja y llevarlo a la pantalla de inicio de sesión cuando la sesión
  ya no se puede renovar.

**Protección de datos personales (Ley N.° 29733)**

- **FR-027**: Las claves y los códigos NUNCA DEBEN guardarse ni registrarse en claro; solo se guarda
  una huella irreversible que permite comprobarlos.
- **FR-028**: El correo y el celular DEBEN guardarse cifrados. El celular DEBE mostrarse siempre
  enmascarado (por ejemplo, `9*****321`), también en la pantalla de edición del administrador; para
  cambiarlo, el administrador escribe el número nuevo.
- **FR-029**: Ningún dato personal (correo, celular, nombre, clave o código) DEBE aparecer en
  direcciones web, registros ni mensajes de error; los registros identifican al usuario solo con su
  identificador interno.

**Envío del código**

- **FR-030**: El envío del código DEBE pasar por un punto de conexión reemplazable: mientras no haya
  proveedor de SMS contratado se usa un envío simulado, y cambiarlo por un proveedor real no debe
  requerir cambios en las reglas del inicio de sesión.
- **FR-031**: El envío simulado DEBE estar disponible solo en desarrollo y pruebas, y el sistema DEBE
  negarse a arrancar en producción si está configurado con el envío simulado.

### Entidades clave

- **Usuario del personal**: persona de la Municipalidad que usa el sistema. Tiene correo (guardado
  cifrado, único, no editable), nombre completo, celular (guardado cifrado), huella de la clave, indicador de si la clave
  es temporal (debe cambiarla), estado activo o inactivo y fechas de creación y actualización.
- **Rol**: uno de los seis roles fijos (mesa de partes, evaluador, inspector, caja, jefatura,
  administrador), ya cargados en el catálogo de roles.
- **Asignación de rol**: relación entre un usuario y un rol, con quién la hizo y cuándo y, si se
  retiró, quién la retiró y cuándo. Un usuario puede tener varias vigentes a la vez; las retiradas se
  conservan como historial.
- **Código de un solo uso**: código de 6 dígitos enviado al celular para el inicio de sesión; guarda
  solo su huella, el número de intentos, el vencimiento y si ya se usó.
- **Sesión**: sesión abierta de un usuario en un dispositivo; permite renovar el acceso hasta su
  vencimiento máximo y se puede cerrar o invalidar.
- **Contador de intentos fallidos**: cantidad de fallos recientes por correo y por origen de
  conexión, compartido por todas las instancias, que determina el bloqueo temporal.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Una persona del personal completa el inicio de sesión en dos pasos (correo, clave y
  código) en menos de 1 minuto desde que abre el portal, en computadora o celular.
- **SC-002**: En la matriz de pruebas por rol (6 roles × operaciones protegidas de prueba), el 100 %
  de los intentos sin sesión responde "no autenticado" y el 100 % de los intentos con un rol
  insuficiente responde "sin permiso", sin ningún dato modificado (EQ-04).
- **SC-003**: En la prueba de fuerza bruta, el inicio de sesión queda bloqueado exactamente en el
  6.º intento fallido dentro de 15 minutos, tanto por correo como por origen de conexión, también
  cuando los intentos se reparten entre varias instancias; y un mismo usuario no recibe más de 3
  códigos en 15 minutos.
- **SC-004**: El 100 % de las respuestas de error del inicio de sesión son indistinguibles entre
  correo inexistente, clave incorrecta, código incorrecto y usuario desactivado.
- **SC-005**: Un usuario desactivado no logra hacer ninguna operación protegida a partir de su
  siguiente intento (0 operaciones aceptadas después de la desactivación).
- **SC-006**: En ningún momento el sistema queda sin administrador activo: el 100 % de los intentos
  probados de desactivar o quitar el rol al último administrador, incluidos intentos simultáneos, son
  rechazados.
- **SC-007**: Una revisión de la base de datos, los registros y las direcciones web generadas durante
  las pruebas encuentra 0 claves o códigos en claro y 0 celulares sin cifrar, y una revisión del
  repositorio encuentra 0 claves reales.
- **SC-008**: Un usuario nuevo cambia su clave temporal y queda listo para trabajar en menos de 2
  minutos desde su primer inicio de sesión, y el 100 % de las operaciones protegidas intentadas antes
  del cambio son rechazadas.
- **SC-009**: Un administrador crea un usuario con sus roles en menos de 2 minutos desde la pantalla de
  gestión, también desde un celular.
- **SC-010**: Las pantallas de inicio de sesión, de cambio de clave y de gestión de usuarios obtienen
  al menos 90 en accesibilidad y en buenas prácticas en una auditoría en modo celular (EQ-05).
- **SC-011**: Reemplazar el envío simulado del código por un proveedor real no requiere modificar
  ninguna regla del inicio de sesión (se verifica porque las pruebas de esas reglas no cambian).

## Supuestos

- La duración de la sesión corta (15 minutos), el máximo de la sesión (8 horas, confirmado), el cierre
  por inactividad (30 minutos, confirmado) y la duración del bloqueo (15 minutos) se pueden
  configurar sin cambiar las reglas.
- La desactivación y los cambios de rol valen desde la siguiente operación del usuario (no al vencer
  su sesión corta), confirmado en las aclaraciones: el escenario EQ-04 exige rechazar el 100 % de los
  intentos no autorizados.
- Cerrar sesión invalida al instante la renovación y el acceso de esa sesión (FR-004); lo mismo
  ocurre con todas las sesiones del usuario cuando se lo desactiva, se le asigna una clave temporal
  o se detecta que reutilizaron su renovación.
- Se permiten sesiones simultáneas del mismo usuario en varios dispositivos.
- El celular del personal es un número móvil del Perú (9 dígitos empezando por 9).
- Los seis roles ya existen en el catálogo de roles cargado por la funcionalidad 001; esta
  funcionalidad no crea roles nuevos.
- El historial de asignaciones de roles (quién asignó o retiró cada rol y cuándo) se cubre en esta
  funcionalidad; la auditoría general de operaciones (RF25) se hará con la funcionalidad de auditoría
  de trámites.
- Las comunicaciones viajan cifradas (TLS 1.3) en los entornos desplegados, según ADR-007; en
  desarrollo local se acepta el tráfico sin cifrar.
- **Fuera de alcance**: verificación de identidad del administrado con DNI/RUC (funcionalidad de
  presentar solicitud), recuperación de clave por correo y auditoría de trámites.
- **Depende de**: la funcionalidad 001 (esqueleto, base de datos con el esquema de seguridad y los
  roles, caché compartida y verificaciones del CI).
