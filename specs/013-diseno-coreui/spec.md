# Especificación de funcionalidad: Diseño visual del portal con CoreUI

**Rama de la funcionalidad**: `013-diseno-coreui`

**Creada**: 2026-11-25

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Mejorar el diseño visual del portal con CoreUI (solo capa
visual: no cambian rutas, sesión, roles, RutaProtegida, clienteApi, contrato OpenAPI ni backend).
Plantilla de referencia, solo para leer y NO copiar archivos completos:
C:\Users\hp\Downloads\coreui-free-react-admin-template-main\coreui-free-react-admin-template-main. Se
pide: (1) área del personal con el diseño de administración de CoreUI: menú lateral que se arma con
las mismas opciones por rol de hoy (Menu.tsx y roles.ts), plegable en el celular; barra superior con
el nombre del usuario y un desplegable 'Mi perfil' y 'Cerrar sesión', migas de pan y pie; (2) portal
del ciudadano ligero y primero celular, sin menú lateral: barra superior con el nombre de la
Municipalidad y 'Acceso del personal', pie, y el botón 'Pregúntanos' se mantiene; (3) tablero de la
jefatura y panel del administrador como dashboard con tarjetas de indicadores al estilo CoreUI, sin
Chart.js (se conserva GraficoBarras); (4) tablas con estilo CoreUI adaptables al celular y los
estados del expediente como insignias de color; (5) formularios, botones, avisos, tarjetas y
paginación con estilo CoreUI, cambiando por dentro los componentes compartidos (como
CampoFormulario) en lugar de cada pantalla; (6) tema con los colores de la Municipalidad (primario
#0b5394 y foco #f2a900), no el de la plantilla; (7) modo claro y oscuro con un selector en la barra
superior del personal y del portal público, que respeta la preferencia del sistema y recuerda la
elección en el navegador, sin parpadeo al cargar y sin scripts en línea; el chat 'Pregúntanos'
conserva su <dialog> nativo y se ve bien en ambos modos. Sin Redux, sin react-router-dom adicional,
sin Chart.js ni simplebar; los componentes del diseño se escriben en TypeScript. Debe cumplir la
constitución: un ADR-012 para la adopción de CoreUI, todas las pruebas actuales del portal y E2E en
verde, Lighthouse móvil con accesibilidad ≥ 90 en ambos modos y sin bajar el rendimiento actual,
contraste suficiente en modo oscuro, accesible a 360 px, y capturas de antes y después para el
informe."

## Alcance

Es **solo la capa visual del portal**. No cambian:

- las rutas ni la protección de rutas por rol;
- la sesión;
- los roles ni las opciones que ve cada rol;
- las llamadas a la API;
- el contrato OpenAPI;
- el backend.

Todo lo que una persona puede hacer hoy lo sigue haciendo igual, en las mismas direcciones y con
los mismos textos de botones, etiquetas y mensajes. Cambia cómo se ve.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - El personal trabaja en un área de administración ordenada (Prioridad: P1)

Una persona del personal (por ejemplo, de caja) entra y ve un área de trabajo con:

- un **menú lateral** con las opciones de sus roles (las mismas de hoy);
- una **barra superior** con su nombre y un desplegable con "Mi perfil" y "Cerrar sesión";
- **migas de pan** que dicen dónde está;
- un **pie** de página.

En el celular, el menú lateral se oculta y se abre con un botón.

**Por qué esta prioridad**: el personal pasa la jornada en estas pantallas. Un menú lateral estable
y una barra con su cuenta hacen el trabajo más rápido y claro, en especial con varios roles.

**Prueba independiente**: ingresar con cada rol y comprobar que:

- el menú lateral muestra exactamente las opciones de ese rol de hoy, en el mismo orden;
- el desplegable de la barra lleva a "Mi perfil" y cierra la sesión;
- a 360 px el menú se abre y se cierra con el botón, sin desplazamiento horizontal.

**Escenarios de aceptación**:

1. **Dado** una persona con el rol CAJA, **cuando** entra, **entonces** el menú lateral muestra
   "Caja" y nada más del área de trabajo. La opción de la pantalla en la que está se marca como
   actual.
2. **Dado** una persona con varios roles (por ejemplo, JEFATURA), **cuando** entra, **entonces** el
   menú lateral muestra todas las opciones de sus roles, en el mismo orden que el menú de hoy.
3. **Dado** una persona sin roles, **cuando** entra, **entonces** llega a "Mi perfil" y el menú
   lateral no muestra opciones de trabajo.
4. **Dado** la barra superior, **cuando** abre el desplegable de su nombre, **entonces** ve "Mi
   perfil" y "Cerrar sesión". Con teclado se abre con Enter o Espacio y se cierra con Escape.
5. **Dado** una pantalla del personal, **cuando** la mira, **entonces** las migas de pan muestran el
   camino con nombres legibles (por ejemplo, "Expedientes › EXP-2026-000123"). Nunca muestran datos
   personales: en la ficha de un usuario se lee "Ficha del usuario", no su nombre ni su correo.
6. **Dado** un celular de 360 px, **cuando** abre una pantalla del personal, **entonces** el menú
   lateral está oculto. Un botón con nombre accesible lo abre y lo cierra, y al elegir una opción el
   menú se cierra.
7. **Dado** una pantalla de escritorio, **cuando** pliega el menú lateral, **entonces** queda
   angosto y el contenido usa el espacio libre.
8. **Dado** el pie de página, **cuando** lo mira, **entonces** ve el nombre de la Municipalidad y del
   sistema.

---

### Historia de usuario 2 - El ciudadano usa un portal ligero, pensado para el celular (Prioridad: P1)

El administrado abre el portal desde su celular y ve:

- una barra superior con el nombre de la Municipalidad y el enlace "Acceso del personal";
- el contenido a todo el ancho, sin menú lateral;
- un pie de página;
- el botón "Pregúntanos", como hoy.

**Por qué esta prioridad**: el administrado entra desde celulares con conexiones lentas (EQ-05).
El portal público debe verse claro y cargar rápido, sin el peso del área de administración.

**Prueba independiente**: abrir la portada, el asistente, una ficha, la consulta y el trámite a
360 px. Comprobar la barra, el pie, "Pregúntanos" y que no hay menú lateral ni desplazamiento
horizontal.

**Escenarios de aceptación**:

1. **Dado** una página pública sin sesión, **cuando** carga, **entonces** la barra superior muestra
   el nombre de la Municipalidad (que lleva a la portada) y el enlace "Acceso del personal" a
   `/ingresar`.
2. **Dado** una página pública con la sesión del personal abierta, **cuando** carga, **entonces** la
   barra no muestra "Acceso del personal" y ofrece un enlace a su pantalla de trabajo.
3. **Dado** una página pública, **cuando** se mira a 360 px, **entonces** no hay menú lateral ni
   desplazamiento horizontal, y los botones tienen áreas táctiles de al menos 44 px.
4. **Dado** una página pública, **cuando** se pulsa "Pregúntanos", **entonces** el chat abre como
   hoy (diálogo nativo, foco, Escape) y no tapa la barra ni el pie.
5. **Dado** `/ingresar` y `/cambiar-clave`, **cuando** se abren, **entonces** usan el diseño ligero
   (sin menú lateral), porque la persona aún no está trabajando.

---

### Historia de usuario 3 - Jefatura y administrador ven sus indicadores como un tablero (Prioridad: P2)

El tablero de la jefatura y el panel del administrador muestran sus números en **tarjetas de
indicadores**: cada una con el número grande, su nombre y un color de acento. Las barras de
`GraficoBarras` siguen como hoy, sin bibliotecas de gráficos nuevas.

**Por qué esta prioridad**: se leen de un vistazo los mismos datos que hoy, sin cambiar qué se
calcula.

**Prueba independiente**: con los datos de prueba de hoy, comprobar que cada número del tablero y
del panel aparece en una tarjeta con su nombre, igual que antes, y que las barras siguen.

**Escenarios de aceptación**:

1. **Dado** el tablero de la jefatura, **cuando** carga, **entonces** cada indicador (los mismos de
   hoy) aparece en una tarjeta con su número y su nombre. A 360 px las tarjetas se apilan en una
   columna y en escritorio forman una grilla.
2. **Dado** el panel del administrador, **cuando** carga, **entonces** sus indicadores aparecen en
   tarjetas iguales, y las que hoy son enlaces (por ejemplo, "Cuentas bloqueadas") siguen llevando a
   la misma pantalla.
3. **Dado** las barras del tablero, **cuando** se muestran, **entonces** son las de `GraficoBarras`,
   con los colores del tema, legibles en modo claro y oscuro.
4. **Dado** un lector de pantalla, **cuando** recorre las tarjetas, **entonces** lee el nombre y el
   número de cada indicador juntos.

---

### Historia de usuario 4 - Tablas legibles en el celular y estados con color (Prioridad: P2)

Las tablas (expedientes, auditorías, usuarios, reportes, eventos) tienen el estilo de CoreUI y se
adaptan al celular: se pueden recorrer sin desarmar la página. El estado de cada expediente se
muestra como una **insignia de color** con su nombre.

**Por qué esta prioridad**: el personal revisa listas todo el día; reconocer un estado por su color
ahorra tiempo.

**Prueba independiente**: abrir la bandeja de expedientes a 360 px y en escritorio. Comprobar que la
página no tiene desplazamiento horizontal (la tabla se desplaza dentro de su contenedor) y que cada
estado es una insignia con texto.

**Escenarios de aceptación**:

1. **Dado** una tabla a 360 px, **cuando** es más ancha que la pantalla, **entonces** se desplaza
   dentro de su propio contenedor y la página no tiene desplazamiento horizontal.
2. **Dado** un expediente, **cuando** se muestra su estado, **entonces** aparece como una insignia
   con el nombre del estado (el mismo texto de hoy). El color nunca es el único indicador, y el
   contraste es suficiente en ambos modos.
3. **Dado** los 13 estados del expediente, **cuando** se muestran, **entonces** cada grupo tiene su
   color: en curso (Registrado, En evaluación, En inspección, ITSE posterior pendiente), requiere
   acción (Observado, Pendiente de pago), positivo (Pagado, Aprobado, Licencia provisional, Licencia
   emitida, Finalizado) y negativo (Denegado, Derivado a fiscalización).
4. **Dado** una tabla, **cuando** la recorre un lector de pantalla, **entonces** conserva sus
   encabezados y su título.

---

### Historia de usuario 5 - Formularios, botones y avisos consistentes en todo el portal (Prioridad: P2)

Todos los formularios, botones, avisos, tarjetas y la paginación tienen el mismo estilo de CoreUI,
con los colores de la Municipalidad. Se logra cambiando por dentro los **componentes compartidos**
(por ejemplo, `CampoFormulario`), no pantalla por pantalla, y sin cambiar textos ni etiquetas.

**Por qué esta prioridad**: un estilo único se aprende una vez. Cambiar los componentes compartidos
evita diferencias entre pantallas y mantiene las pruebas actuales.

**Prueba independiente**: recorrer el ingreso, la solicitud en línea, la ficha de un usuario y la
caja, y comprobar que campos, botones, avisos y paginación tienen el mismo estilo. Todas las pruebas
actuales del portal deben seguir en verde sin cambiar lo que comprueban.

**Escenarios de aceptación**:

1. **Dado** un campo de formulario, **cuando** se muestra, **entonces** tiene su etiqueta asociada,
   su ayuda y su error con el estilo de CoreUI. El error se anuncia igual que hoy.
2. **Dado** los botones principal, secundario y de peligro, **cuando** se muestran, **entonces**
   usan el color primario de la Municipalidad (#0b5394) o sus variantes, con al menos 44 px de alto.
3. **Dado** cualquier elemento con foco de teclado, **cuando** recibe el foco, **entonces** muestra
   un contorno visible con el color de foco de la Municipalidad (#f2a900), en ambos modos.
4. **Dado** los avisos de éxito, información y error, **cuando** se muestran, **entonces** usan el
   estilo de alerta de CoreUI y conservan su `role` ("status" o "alert").
5. **Dado** una lista paginada, **cuando** se muestra la paginación, **entonces** usa el estilo de
   CoreUI con la página actual marcada para lectores de pantalla.

---

### Historia de usuario 6 - Modo claro u oscuro, a elección (Prioridad: P2)

Un botón en la barra superior del personal y del portal público alterna entre modo claro y
oscuro. Mientras la persona no elige, el portal empieza en el modo de su dispositivo. En cuanto
elige, la elección se recuerda en ese navegador y se respeta aunque el dispositivo cambie. La página
aparece desde el primer momento en el modo correcto, sin destellos.

> **Corrección (2026-11-25)**: el selector tenía tres opciones ("Claro", "Oscuro" y "Como el
> sistema"). Se quita "Como el sistema": queda un solo botón que alterna entre los dos modos. La
> preferencia del dispositivo solo da el valor inicial.

**Por qué esta prioridad**: muchas personas usan el celular en modo oscuro, y el personal que
trabaja muchas horas lo agradece. Es una mejora de comodidad, no de función.

**Prueba independiente**: con el sistema en modo oscuro, abrir el portal y comprobar que aparece
oscuro desde el primer pintado. Elegir "claro", recargar y comprobar que sigue claro. Repetir con el
chat abierto.

**Escenarios de aceptación**:

1. **Dado** un navegador sin elección guardada, **cuando** el sistema está en modo oscuro,
   **entonces** el portal se muestra oscuro desde el primer pintado.
2. **Dado** el botón de modo, **cuando** la persona lo usa, **entonces** el portal pasa al otro
   modo de inmediato, y la elección se recuerda al recargar y al cerrar sesión, aunque el dispositivo
   esté en el modo contrario.
3. **Dado** el navegador no deja guardar la elección (modo privado o almacenamiento bloqueado),
   **cuando** elige un modo, **entonces** se aplica en esa página y, al recargar, vuelve al modo del
   dispositivo, sin errores.
4. **Dado** el modo oscuro, **cuando** se muestra cualquier pantalla (incluido el chat
   "Pregúntanos" abierto, las insignias, las tablas y las barras), **entonces** el texto tiene
   contraste suficiente.
5. **Dado** el botón de modo, **cuando** se usa con teclado o lector de pantalla, **entonces** su
   nombre accesible dice a qué modo cambia ("Cambiar a modo oscuro" o "Cambiar a modo claro") y el
   cambio se anuncia.

---

### Casos límite

- **Sesión que vence o se cierra en una pantalla del personal**: el comportamiento es el de hoy (va
  a `/ingresar`). El diseño ligero aparece sin restos del menú lateral.
- **Persona con todos los roles**: el menú lateral muestra todas sus opciones y se desplaza dentro de
  sí mismo si no caben.
- **Nombre del usuario muy largo**: en la barra se recorta con puntos suspensivos y se lee completo
  en el desplegable.
- **Pantallas de 320 px**: no se rompe el diseño (360 px es la medida exigida; 320 px no debe tener
  desplazamiento horizontal en la barra).
- **Navegador sin `prefers-color-scheme`**: usa el modo claro.
- **Impresión o descarga de la esquela y la licencia**: no cambian (son PDF del backend).
- **Chat abierto y cambio de modo**: el chat cambia de colores sin cerrarse.
- **Animaciones**: con `prefers-reduced-motion`, el menú lateral se abre y se cierra sin animación.
- **Política de seguridad de contenido de producción**: hoy es `script-src 'self'` y `style-src
  'self'`, sin `'unsafe-inline'`. Ningún componente del diseño puede depender de scripts ni de
  estilos en línea que esa política bloquee.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Alcance y compatibilidad**

- **FR-001**: Los cambios DEBEN limitarse a la capa visual del portal. No cambian las rutas,
  `RutaProtegida`, la sesión, los roles y sus opciones, `clienteApi`, el contrato OpenAPI ni el
  backend.
- **FR-002**: Todos los textos visibles, las etiquetas de los campos, los nombres de los botones y
  enlaces y los mensajes DEBEN mantenerse. Así, todas las pruebas actuales del portal y del E2E
  siguen en verde sin cambiar lo que comprueban. Solo se ajustan las que dependían de la estructura
  visual y no del comportamiento, y cada ajuste se justifica.
- **FR-003**: El diseño DEBE ser compatible con la política de seguridad de contenido de producción
  (sin `'unsafe-inline'` en scripts ni estilos) y no agregar recursos de terceros en tiempo de
  ejecución (fuentes, iconos o scripts desde otro dominio).

**Área del personal**

- **FR-004**: Las pantallas del personal (`/admin*`, `/personal*` y `/perfil`) DEBEN usar un diseño
  de administración con menú lateral, barra superior, migas de pan y pie.
- **FR-005**: El menú lateral DEBE armarse con las mismas opciones por rol del menú actual: las
  mismas etiquetas, rutas, orden y reglas de visibilidad. La opción de la pantalla actual se marca
  con `aria-current="page"`.
- **FR-006**: En pantallas angostas (menos de 768 px), el menú lateral DEBE estar oculto y abrirse
  con un botón que tenga nombre accesible y `aria-expanded`. Se cierra con Escape, al tocar fuera o al
  elegir una opción. En escritorio se puede plegar.
- **FR-007**: La barra superior del personal DEBE mostrar el nombre completo del usuario y un
  desplegable con "Mi perfil" (a `/perfil`) y "Cerrar sesión" (el mismo comportamiento de hoy),
  operable con teclado.
- **FR-008**: Las migas de pan DEBEN armarse con nombres legibles de cada tramo de la ruta y NO
  DEBEN mostrar datos personales. Se permiten números de expediente y códigos de receta, pero no
  nombres, correos ni identificadores de usuario.
- **FR-009**: El pie DEBE mostrar el nombre de la Municipalidad Provincial de Huanta y del sistema.

**Portal del ciudadano**

- **FR-010**: Las páginas públicas, `/ingresar` y `/cambiar-clave` DEBEN usar un diseño ligero sin
  menú lateral: barra superior con el nombre de la Municipalidad (enlace a `/`), contenido a todo el
  ancho y pie.
- **FR-011**: Sin sesión del personal, la barra pública DEBE mostrar "Acceso del personal"
  (`/ingresar`), excepto en `/ingresar`. Con sesión, en su lugar muestra un enlace a la pantalla de
  trabajo de la persona. Reemplaza la barra fina de la 011 con el mismo comportamiento.
- **FR-012**: El botón "Pregúntanos" y el chat DEBEN mantenerse con su `<dialog>` nativo y su
  comportamiento de la 012 (solo en las páginas públicas, foco, Escape, región `aria-live`), y verse
  bien en ambos modos.

**Indicadores, tablas y componentes**

- **FR-013**: El tablero de la jefatura y el panel del administrador DEBEN mostrar sus indicadores
  (los mismos datos de hoy) en tarjetas al estilo CoreUI. Las barras siguen siendo de
  `GraficoBarras`. No se agregan bibliotecas de gráficos.
- **FR-014**: Las tablas DEBEN tener el estilo de CoreUI y, en pantallas angostas, desplazarse
  dentro de su contenedor sin que la página tenga desplazamiento horizontal.
- **FR-015**: El estado de un expediente DEBE mostrarse como una insignia con su nombre y un color
  por grupo (en curso, requiere acción, positivo, negativo), con contraste suficiente en ambos modos.
- **FR-016**: Formularios, botones, avisos, tarjetas y paginación DEBEN tener el estilo de CoreUI,
  aplicado en los componentes compartidos (`CampoFormulario`, `Confirmacion`, `TablaEventos` y otros)
  y en clases comunes, no pantalla por pantalla.
- **FR-017**: Los avisos DEBEN conservar su `role` ("status" o "alert") y su texto.

**Tema y modos**

- **FR-018**: El tema DEBE usar los colores de la Municipalidad: primario #0b5394 (con su variante
  oscura #083d6d) y foco #f2a900. No se usan los colores de la plantilla de CoreUI.
- **FR-019**: El portal DEBE ofrecer modo claro y oscuro con un solo botón en la barra superior
  del personal y del portal público, que alterna entre los dos. Muestra un sol o una luna, y su
  nombre accesible dice a qué modo cambia ("Cambiar a modo oscuro" o "Cambiar a modo claro"). No
  hay opción "Como el sistema".
- **FR-020**: Mientras la persona no elige, el modo inicial DEBE ser la preferencia del dispositivo
  (`prefers-color-scheme`). En cuanto elige, la elección se guarda y se respeta aunque el
  dispositivo esté en el modo contrario. La elección se guarda solo en el navegador (sin datos
  personales ni llamadas a la API) y se conserva al cerrar sesión.
- **FR-021**: La página DEBE pintarse desde el primer momento en el modo correcto, sin destellos del
  modo equivocado, sin scripts ni estilos en línea.
- **FR-022**: Si el navegador no permite guardar la elección, el selector DEBE funcionar en la
  página abierta, sin errores.

**Accesibilidad**

- **FR-023**: Todo el portal DEBE funcionar a 360 px sin desplazamiento horizontal, con áreas
  táctiles de al menos 44 px, foco visible y orden de tabulación lógico, en ambos modos.
- **FR-024**: El texto DEBE tener un contraste de al menos 4.5:1 (3:1 para texto grande y
  componentes de interfaz) en modo claro y en modo oscuro.
- **FR-025**: Con `prefers-reduced-motion`, las transiciones del menú lateral y del desplegable
  DEBEN desactivarse.

**Restricciones de construcción** (pedidas por la usuaria)

- **FR-026**: Los componentes del diseño DEBEN escribirse en TypeScript. NO DEBEN agregarse Redux,
  `react-router-dom`, Chart.js ni simplebar.
- **FR-027**: La plantilla de CoreUI se usa solo como referencia de lectura. NO DEBEN copiarse sus
  archivos completos.

### Entidades clave

- **Preferencia de modo**: "claro" u "oscuro". Se guarda solo en el navegador cuando la persona
  elige; si no hay una guardada, vale la preferencia del dispositivo.
- **Opción del menú**: etiqueta, ruta y roles que la ven. Son las mismas de hoy; el menú lateral las
  lee de la misma fuente que el menú actual.
- **Grupo de estado**: en curso, requiere acción, positivo o negativo. Lo usa la insignia de cada
  estado del expediente.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: El 100 % de las pruebas actuales del portal (497) y de los recorridos E2E (4 × 2
  tamaños) siguen en verde. Cada prueba ajustada lleva su justificación, y ninguna deja de comprobar
  un comportamiento.
- **SC-002**: Accesibilidad de Lighthouse móvil (360×740) **≥ 90 en modo claro y en modo oscuro**
  en estas pantallas:
  - la portada, el asistente, la consulta e `/ingresar`;
  - el chat abierto (en modo snapshot);
  - una pantalla del personal con menú lateral (por ejemplo, la bandeja de expedientes) y el tablero.
- **SC-003**: El rendimiento de Lighthouse móvil de esas pantallas no baja respecto de la medida
  tomada antes del cambio, con la misma herramienta y las mismas condiciones. La línea base se toma
  al empezar la funcionalidad.
- **SC-004**: Ninguna combinación de texto y fondo de las pantallas revisadas baja de 4.5:1 (3:1
  para texto grande) en modo oscuro ni en modo claro.
- **SC-005**: A 360 px, ninguna pantalla revisada tiene desplazamiento horizontal, en ambos modos y
  con el menú lateral abierto o cerrado.
- **SC-006**: Con el sistema en modo oscuro y sin elección guardada, el primer pintado de la portada
  ya es oscuro. Se comprueba en el E2E leyendo el modo antes de que React monte.
- **SC-007**: El menú lateral de cada uno de los 6 roles, y el de una persona sin roles, tiene
  exactamente las opciones que tiene hoy cada uno.
- **SC-008**: El informe tiene capturas de antes y después de al menos 6 pantallas (portada, chat,
  ingreso, bandeja, tablero y panel), a 360 px y en escritorio, en modo claro y oscuro.

## Escenarios de calidad afectados

- **EQ-05 (usabilidad y accesibilidad)**: diseño a 360 px, contraste en ambos modos y foco visible.
  Se comprueba con Lighthouse (normal y en modo snapshot), Playwright y las pruebas del portal.
- **EQ-01 (rendimiento percibido)**: el portal público no debe cargar el peso del área de
  administración ni bajar el rendimiento de Lighthouse (SC-003).
- **EQ-04 (seguridad)**: compatible con la política de seguridad de contenido de producción y sin
  datos personales en las migas de pan.
- **EQ-06 (mantenibilidad)**: el estilo vive en los componentes compartidos y en el tema, no en cada
  pantalla. La adopción de CoreUI queda registrada en el ADR-012.

## Dependencias

- **ADR-012** "Adopción de CoreUI para el diseño del portal" en
  `docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md`. El último ADR es el ADR-011.
- **CoreUI (edición libre, licencia MIT)**: componentes y estilos. La plantilla de administración se
  lee solo como referencia; se excluyen sus dependencias de Redux, `react-router-dom`, Chart.js y
  simplebar.
- **Línea base de Lighthouse** (rendimiento y accesibilidad) y **capturas "antes"**: se toman al
  empezar, antes de cualquier cambio visual.
- **Política de seguridad de contenido** de `infra/produccion/Caddyfile` y de nginx: no se relaja.

## Supuestos

- La "barra fina" de "Acceso del personal" de la 011 se reemplaza por el enlace en la barra pública,
  con el mismo comportamiento.
- Con la sesión del personal abierta, en las páginas públicas la barra muestra un enlace a su
  pantalla de trabajo (la de `inicioDe(roles)`) en lugar del menú del personal de hoy. Así el portal
  público no carga el menú lateral.
- `/perfil` es una pantalla del personal (con menú lateral). `/ingresar` y `/cambiar-clave` usan el
  diseño ligero.
- Medir el rendimiento "sin bajar" compara la misma pantalla, con la misma herramienta y en la
  misma máquina, antes y después. Lighthouse varía uno o dos puntos entre corridas, así que se toma
  la mediana de 3 corridas.
- La elección de modo se guarda en `localStorage` del navegador. No es un dato personal y no viaja a
  la API.
- Los PDF del backend (esquela y licencia) no cambian.
