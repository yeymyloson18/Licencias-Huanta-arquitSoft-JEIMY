# Especificación de funcionalidad: Panel del administrador, auditoría de seguridad y buzón de pruebas

**Rama de la funcionalidad**: `009-panel-administrador`

**Creada**: 2026-11-23

**Estado**: Borrador

**Entrada**: Descripción de la usuaria: "Usa como entrada el archivo docs/sdd/009-panel-administrador.md"
(Funcionalidad 009. El administrador del sistema entra con sus credenciales y debe tener **su**
interfaz para administrar el sistema, vigilar a los demás usuarios y roles, consultar una auditoría de
seguridad y detener a un usuario ante una actividad sospechosa. Además, en la computadora de
desarrollo todo debe poder probarse por el enlace, sin leer códigos desde la terminal.)

**Amplía**: la 002 (HU15, RF16, RF17, RF22) y toca ADR-007 (seguridad por capas).

**Lo que ya existe y no se rehace**:

- crear usuarios con clave temporal y roles;
- cambio obligatorio de clave en el primer ingreso;
- editar, desactivar (corta sus sesiones al instante) y reactivar;
- asignar y quitar roles con historial;
- asignar una clave temporal nueva;
- la regla de "nunca sin administrador activo";
- la edición del catálogo y de los feriados.

Los 6 roles son fijos: el administrador **asigna** roles, no crea roles nuevos. A un usuario no se le
elimina: se le desactiva, para no perder la trazabilidad.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Panel del administrador (Prioridad: P1)

El administrador inicia sesión y llega directo a su panel. De un vistazo ve cuántos usuarios hay
activos e inactivos, cuántos tiene cada rol, cuántas cuentas están bloqueadas ahora por intentos
fallidos, cuántas sesiones hay abiertas, cuántos ingresos fallaron hoy y en los últimos 7 días, y los
últimos 10 eventos de la auditoría de seguridad. Desde ahí va con un toque a Usuarios, Auditoría,
Catálogo y Feriados.

**Por qué esta prioridad**: es el pedido central de la usuaria. Sin el panel, el administrador no
tiene "su" interfaz ni ve a tiempo una actividad sospechosa.

**Prueba independiente**: ingresar como administrador, comprobar que se abre el panel y que sus
cifras coinciden con los datos sembrados (usuarios, roles, una cuenta bloqueada a propósito y varios
intentos fallidos).

**Escenarios de aceptación**:

1. **Dado** un administrador con su sesión recién iniciada, **cuando** termina de ingresar,
   **entonces** llega al panel del administrador y no a la página de inicio del personal.
2. **Dado** 5 usuarios activos y 2 inactivos, **cuando** abre el panel, **entonces** ve 5 activos y 2
   inactivos, y el número de usuarios activos de cada uno de los 6 roles.
3. **Dado** una cuenta que acumuló 5 intentos fallidos hace 3 minutos, **cuando** abre el panel,
   **entonces** la tarjeta "Cuentas bloqueadas" cuenta 1.
4. **Dado** que el servicio que guarda los bloqueos no responde, **cuando** abre el panel,
   **entonces** la tarjeta de bloqueos dice que el dato no está disponible (no muestra 0) y el resto
   del panel funciona.
5. **Dado** un celular de 360 px de ancho, **cuando** abre el panel, **entonces** todo se lee sin
   desplazamiento horizontal y se puede recorrer con el teclado y con un lector de pantalla.

---

### Historia de usuario 2 - Auditoría de seguridad (Prioridad: P1)

El administrador abre "Auditoría" desde su menú y ve una lista paginada, de la más reciente a la más
antigua, con la fecha y hora, quién actuó (su nombre o "sistema"), la acción en español sencillo,
sobre quién o sobre qué (nombre del usuario afectado, código de la receta o fecha del feriado) y el
resultado. Puede filtrar por rango de fechas, acción, usuario que actuó y usuario afectado, y
descargar el mismo resultado en una hoja de cálculo (CSV).

**Por qué esta prioridad**: responde "quién hizo qué y cuándo", que es la base para detectar y probar
una actividad sospechosa.

**Prueba independiente**: hacer un ingreso correcto, uno con clave incorrecta, crear un usuario,
cambiarle un rol y actualizar una receta; abrir la auditoría y encontrar los cinco eventos, filtrar
por acción y descargar el CSV con los mismos filtros.

**Escenarios de aceptación**:

1. **Dado** un ingreso con una clave incorrecta, **cuando** el administrador abre la auditoría,
   **entonces** ve "Clave incorrecta" con la fecha, el nombre de la persona y el resultado "rechazado".
2. **Dado** un intento de ingreso con un correo que no existe, **cuando** se revisa la auditoría,
   **entonces** el evento aparece sin identificar a nadie: ni nombre, ni correo, ni origen en claro.
3. **Dado** que el administrador cambió una tasa de una receta, **cuando** abre la auditoría,
   **entonces** ve "Receta actualizada" con su nombre y el código de la receta.
4. **Dado** el filtro "acción = Rol asignado" y un rango de fechas, **cuando** aplica el filtro,
   **entonces** solo ve esos eventos y el CSV descargado trae exactamente las mismas filas.
5. **Dado** más eventos que los de una página, **cuando** avanza de página, **entonces** sigue el orden
   de más reciente a más antiguo sin repetir ni saltar eventos.

---

### Historia de usuario 3 - Ficha del usuario con acciones rápidas (Prioridad: P1)

Desde la lista de usuarios, el administrador abre la ficha de una persona y ve sus datos (con el
celular enmascarado), sus roles, si está activa, su último ingreso, cuántas sesiones tiene abiertas, si
está bloqueada y hasta cuándo, su historial de roles (qué rol, quién lo asignó o quitó y cuándo) y sus
últimos eventos de auditoría. Desde ahí, con una confirmación previa, puede cerrar todas sus sesiones,
desbloquear su cuenta, desactivarla o reactivarla y asignarle una clave temporal.

**Por qué esta prioridad**: es la acción de "detener a un usuario" que pidió la usuaria, y debe ser
rápida.

**Prueba independiente**: con un usuario con una sesión abierta, pulsar "Cerrar todas sus sesiones" y
comprobar que su próxima petición es rechazada y que sigue activo. Con un usuario bloqueado, pulsar
"Desbloquear cuenta" y comprobar que puede volver a intentar en el acto.

**Escenarios de aceptación**:

1. **Dado** un usuario con dos sesiones abiertas, **cuando** el administrador confirma "Cerrar todas
   sus sesiones", **entonces** ambas sesiones dejan de servir en la siguiente petición, el usuario sigue
   activo y puede volver a ingresar, y la auditoría registra "Sesiones cerradas".
2. **Dado** un usuario bloqueado por 5 intentos fallidos hace 2 minutos, **cuando** el administrador
   confirma "Desbloquear cuenta", **entonces** el usuario puede intentar ingresar de nuevo sin esperar los
   15 minutos y la auditoría registra "Cuenta desbloqueada".
3. **Dado** la ficha del propio administrador, **cuando** la abre, **entonces** los botones "Cerrar todas
   sus sesiones" y "Desbloquear cuenta" no están disponibles, y si se llama a la operación igual, el
   sistema la rechaza.
4. **Dado** que el administrador es el único administrador activo, **cuando** intenta desactivarse o
   quitarse el rol, **entonces** el sistema lo rechaza como hoy.
5. **Dado** cualquier botón de la ficha, **cuando** el administrador lo pulsa, **entonces** se le pide
   confirmar antes de actuar, y si cancela no cambia nada.
6. **Dado** la ficha de un usuario, **cuando** se muestra el historial de roles, **entonces** cada
   asignación indica el rol, quién la hizo y cuándo, y si fue retirada, quién y cuándo.

---

### Historia de usuario 4 - Buzón de pruebas en desarrollo (Prioridad: P2)

Una estudiante que prueba el sistema en su computadora abre una página web del buzón de pruebas y ve
llegar cada código de 6 dígitos y cada aviso al administrado como un mensaje: el asunto dice a quién
iba (con el celular o el correo enmascarado) y para qué; el cuerpo trae el código o el aviso. Así
recorre todo el sistema por el enlace, sin la terminal. El único paso de terminal, además de encender
el sistema, es crear el primer administrador.

**Por qué esta prioridad**: facilita mucho las pruebas y la demostración, pero el sistema ya funciona
sin el buzón.

**Prueba independiente**: con el entorno de desarrollo, pedir un código de ingreso y verlo llegar al
buzón; después usarlo para entrar.

**Escenarios de aceptación**:

1. **Dado** el entorno de desarrollo encendido, **cuando** un usuario del personal pide su código de
   ingreso, **entonces** aparece un mensaje en el buzón con el celular enmascarado en el asunto y el
   código en el cuerpo, y ese código sirve para entrar.
2. **Dado** un aviso al administrado (por ejemplo, una observación), **cuando** se genera, **entonces**
   aparece en el buzón con el destino enmascarado y el texto del aviso.
3. **Dado** la configuración de producción, **cuando** se elige el buzón como medio de envío,
   **entonces** el sistema se niega a arrancar, igual que con el envío simulado.
4. **Dado** las pruebas automáticas y los recorridos de extremo a extremo, **cuando** corren con el
   buzón o con el envío simulado, **entonces** pueden seguir leyendo el código como hoy.

---

### Casos límite

- **Intento con un correo inexistente**: se registra el evento sin actor ni afectado, y sin el correo.
- **Muchos intentos desde un mismo origen**: si se guarda el origen, solo como huella irreversible que
  permite agrupar, nunca la dirección en claro.
- **Desbloquear a quien no está bloqueado**: responde con éxito sin cambiar nada y lo registra igual
  (la acción fue pedida); el panel no cambia.
- **Cerrar sesiones de quien no tiene ninguna**: responde con éxito y lo registra con 0 sesiones.
- **Usuario desactivado**: se pueden cerrar sus sesiones (no tendrá) y desbloquearlo; reactivarlo no
  le devuelve sesiones viejas.
- **Usuario que no existe**: la ficha y las acciones responden "no encontrado".
- **El servicio de bloqueos no responde**: el panel y la ficha lo dicen y el botón "Desbloquear" queda
  deshabilitado; la operación responde "servicio no disponible". No se inventan cifras.
- **Rango de fechas invertido o mayor que 1 año** en la auditoría: se rechaza con un mensaje claro.
- **CSV muy grande**: se limita a un máximo de filas y se avisa si el filtro trae más.
- **Un evento de catálogo o feriado que llega dos veces**: aparece una sola vez en la auditoría.
- **El buzón está apagado en desarrollo**: el envío del código falla como cuando falla el proveedor
  (se devuelve el cupo de envíos) y el sistema no se cae.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Panel (HU1)**

- **FR-001**: Al terminar de ingresar, una persona con el rol ADMINISTRADOR MUST llegar a su panel.
- **FR-002**: El panel MUST mostrar: usuarios activos e inactivos; usuarios activos por cada uno de los
  6 roles; cuentas bloqueadas en este momento por intentos fallidos; sesiones abiertas; ingresos
  fallidos de hoy y de los últimos 7 días; y los últimos 10 eventos de la auditoría de seguridad.
- **FR-003**: El panel MUST tener accesos directos a Usuarios, Auditoría, Catálogo y Feriados.
- **FR-004**: Si el servicio que guarda los bloqueos no responde, el panel MUST indicar "no
  disponible" en esa cifra y seguir mostrando el resto.
- **FR-005**: El panel, la auditoría y la ficha MUST poder usarse a 360 px sin desplazamiento
  horizontal, con teclado y con lector de pantalla.

**Auditoría de seguridad (HU2)**

- **FR-006**: El sistema MUST registrar en la auditoría de seguridad estas acciones:
  - Ingresos: ingreso correcto, clave incorrecta, código incorrecto, cuenta bloqueada, origen
    bloqueado, cierre de sesión, clave cambiada.
  - Gestión de usuarios: usuario creado, usuario editado, usuario desactivado, usuario reactivado, rol
    asignado, rol quitado, clave temporal asignada, sesiones cerradas, cuenta desbloqueada.
  - Configuración: receta actualizada, receta desactivada, receta reactivada, feriado registrado,
    feriado eliminado.
- **FR-007**: Cada evento MUST guardar fecha y hora, acción, quién actuó (o "sistema"/nadie), a quién
  afectó, sobre qué objeto (código de receta o fecha de feriado) y el resultado.
- **FR-008**: El registro de cada acción de gestión de usuarios e ingreso MUST quedar guardado junto
  con el cambio que describe: si el cambio no se guarda, el evento tampoco, y viceversa.
- **FR-009**: Los eventos de catálogo y de feriados MUST llegar a la auditoría aunque esos módulos no
  escriban en los datos de seguridad, y MUST aparecer una sola vez aunque el aviso se repita.
- **FR-010**: La auditoría MUST mostrarse paginada, de la más reciente a la más antigua, con los
  filtros rango de fechas, acción, usuario que actuó y usuario afectado.
- **FR-011**: El administrador MUST poder descargar la auditoría en CSV con los mismos filtros que la
  lista.
- **FR-012**: La auditoría MUST NOT poder editarse ni borrarse desde la aplicación: solo se agregan
  eventos. Se conserva al menos 1 año.
- **FR-013**: La auditoría y su CSV MUST NOT contener correo, celular, documento, clave, código ni la
  dirección de origen en claro. Si se guarda el origen, solo su huella irreversible. Los registros de
  la aplicación siguen sin datos personales.
- **FR-014**: Un intento de ingreso con un correo que no existe MUST registrarse sin identificar a
  nadie.

**Ficha del usuario (HU3)**

- **FR-015**: La ficha MUST mostrar: nombre, correo, celular enmascarado, roles, estado, último
  ingreso, sesiones abiertas, si está bloqueado y hasta cuándo, historial de roles y sus últimos
  eventos de auditoría.
- **FR-016**: "Cerrar todas sus sesiones" MUST dejar sin efecto al instante todas las sesiones del
  usuario sin desactivarlo, con el mismo mecanismo que la desactivación.
- **FR-017**: "Desbloquear cuenta" MUST borrar el bloqueo por intentos fallidos de esa cuenta antes de
  que venza.
- **FR-018**: El administrador MUST NOT poder cerrar sus propias sesiones ni desbloquearse a sí mismo
  desde la ficha. Se mantiene la regla de no quedar sin administrador activo.
- **FR-019**: Cada botón de la ficha MUST pedir confirmación antes de actuar, y cada acción MUST quedar
  en la auditoría.
- **FR-020**: Desactivar, reactivar y asignar clave temporal MUST estar disponibles desde la ficha.

**Permisos (todas)**

- **FR-021**: Panel, auditoría de seguridad, ficha y sus acciones MUST ser solo para ADMINISTRADOR:
  los demás roles reciben "sin permiso" (403) y sin sesión "no autenticado" (401).
- **FR-022**: La auditoría de pagos y decisiones de la jefatura (005) MUST seguir igual y separada.

**Buzón de pruebas (HU4)**

- **FR-023**: En el entorno de desarrollo MUST existir un buzón de pruebas con página web que reciba
  cada código de 6 dígitos y cada aviso al administrado como un mensaje, con el destino enmascarado en
  el asunto, el propósito, y el código o el aviso en el cuerpo.
- **FR-024**: El buzón MUST ser un medio de envío elegible por configuración y MUST estar prohibido en
  producción, igual que el envío simulado.
- **FR-025**: El entorno de desarrollo MUST usar el buzón por defecto.
- **FR-026**: Las pruebas automáticas, los recorridos de extremo a extremo y la carga MUST seguir
  pudiendo leer el código como hoy.
- **FR-027**: El primer administrador MUST seguir creándose por la terminal; la documentación MUST
  decir que es el único paso de terminal además de encender el sistema.

### Entidades clave

- **Evento de auditoría de seguridad**: un hecho ocurrido. Tiene fecha y hora, acción (de una lista
  cerrada), quién actuó (opcional), a quién afectó (opcional), objeto (texto corto opcional), resultado
  y un detalle sin datos personales. Solo se agrega.
- **Acción de auditoría**: lista cerrada de 21 acciones en tres grupos (ingresos, gestión de usuarios y
  configuración), cada una con su texto en español sencillo.
- **Bloqueo de cuenta**: estado temporal (15 minutos) por intentos fallidos de un correo; se lee y se
  borra sin exponer el correo.
- **Sesión**: ya existe; se cuenta y se revoca.
- **Asignación de rol**: ya existe con su historial; se muestra en la ficha.
- **Mensaje del buzón**: copia de un código o un aviso con destino enmascarado, solo en desarrollo.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: El administrador llega a su panel en el 100 % de sus ingresos y ve las cifras en menos
  de 2 segundos con 10,000 eventos de auditoría.
- **SC-002**: El 100 % de las 21 acciones de la lista aparece en la auditoría cuando ocurre, verificado
  por una prueba automática por acción.
- **SC-003**: Después de "Cerrar todas sus sesiones", el 100 % de las peticiones con esas sesiones es
  rechazado desde la siguiente petición.
- **SC-004**: Después de "Desbloquear cuenta", el usuario puede volver a intentar en menos de 5
  segundos, sin esperar los 15 minutos.
- **SC-005**: 0 apariciones de correo, celular, documento, clave, código u origen en claro en la
  auditoría, en su CSV y en los registros, verificado por pruebas de privacidad.
- **SC-006**: El 100 % de las operaciones nuevas responde 401 sin sesión y 403 con cada rol que no es
  ADMINISTRADOR, verificado por la matriz de permisos.
- **SC-007**: Una persona recorre el sistema completo en desarrollo, empezando por el administrador,
  sin abrir la terminal salvo para encenderlo y crear el primer administrador.
- **SC-008**: Las tres pantallas nuevas tienen accesibilidad sin errores graves y se usan a 360 px sin
  desplazamiento horizontal.
- **SC-009**: Los controles obligatorios del repositorio, los recorridos de extremo a extremo y el
  recorrido de humo siguen en verde.

## Supuestos

- "Cuentas bloqueadas" cuenta las cuentas con 5 o más intentos fallidos en la ventana vigente de 15
  minutos (regla de la 002). Los bloqueos por origen no cuentan como cuentas, pero el panel puede
  mostrarlos aparte como "orígenes bloqueados" sin revelar la dirección.
- "Sesiones abiertas" son sesiones no revocadas que no superaron su vencimiento máximo ni el tiempo
  sin actividad.
- "Hoy" y "últimos 7 días" usan la hora de Perú (UTC−5).
- El "último ingreso" es el último ingreso correcto registrado en la auditoría.
- La auditoría empieza a llenarse desde esta funcionalidad: no se reconstruyen eventos anteriores, salvo
  el historial de roles, que ya existe.
- El CSV usa el mismo formato que los reportes de la 007 (separador coma, UTF-8 con BOM).
- Fuera de alcance: roles personalizados, borrar usuarios, correo o SMS reales (Sprint 3) y alertas
  automáticas por correo al administrador.
- Restricción del entorno de la usuaria: poca memoria. Lo pesado lo valida la integración continua.
