---
description: 'Tareas para implementar el diseño visual del portal con CoreUI (013)'
---

# Tareas: Diseño visual del portal con CoreUI

**Entrada**: documentos de `specs/013-diseno-coreui/`.

**Requisitos previos**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/) y [quickstart.md](quickstart.md).

**Pruebas**: obligatorias (constitución, principio V). En cada historia se escriben primero. Las
497 pruebas actuales del portal y los recorridos E2E deben seguir en verde. Solo se ajustan las de
research R-11, con su justificación.

**Alcance**: solo `apps/web` y `tests/e2e`. **No se toca**:

- `apps/api` ni el contrato;
- las rutas, la sesión, los roles y `RutaProtegida`;
- `clienteApi`;
- la CSP.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes).
- **[US#]**: historia de usuario de `spec.md`.

---

## Fase 1: Preparación (línea base primero, después dependencias)

**Propósito**: medir y fotografiar el portal **antes de cambiar nada**, e instalar CoreUI con el
tema compilando.

**⚠️ IMPORTANTE**: T003 se hace antes de T004. La línea base de SC-003 y las capturas "antes" son
del portal sin CoreUI.

- [X] T001 [P] Capturas con Playwright en `tests/e2e/capturas.spec.ts`. Se salta si no hay
      `CAPTURAS=antes|despues` y no corre en CI.
  - **Pantallas**:
    - portada `/`;
    - portada con el chat abierto;
    - `/ingresar`;
    - la bandeja `/personal/expedientes` (EVALUADOR);
    - el tablero `/personal/tablero` (JEFATURA);
    - el panel `/admin` (ADMINISTRADOR).
  - **Ingreso**: con `ingresar` de `apoyo/sistema.ts`.
  - **Tamaños**: los proyectos `celular` (360×740) y `escritorio` (1280×800).
  - **Modos**: con `antes`, **solo el claro**, porque antes de la 013 no existe modo oscuro y una
    captura "antes" en oscuro no mostraría nada distinto. Con `despues`, claro y oscuro, emulando
    `colorScheme` con `page.emulateMedia`. Así se interpreta SC-008 (análisis I2): las capturas
    "después" son en ambos modos y las "antes" solo en claro.
  - **Salida**: `docs/08-sprint-2/evidencias/diseno-013/<antes|despues>/<modo>/<proyecto>-<pantalla>.png`,
    con página completa.
- [X] T002 [P] Medidor `tests/e2e/apoyo/lighthouse-medida.mjs`: Lighthouse con un flujo de puppeteer,
      instalado como en el paso del chat de la 012 (`lighthouse@12.2.1` y `puppeteer-core@23.11.1`
      en una carpeta temporal).
  - **Argumentos**: `--url`, `--proyecto` (para leer el código simulado de Redis del compose
    aislado), `--corridas` (por defecto 3), `--modos` (por defecto `claro`) y `--salida`.
  - **Pantallas**:
    - en modo navegación: la portada, `/asistente`, `/consulta` e `/ingresar`;
    - el chat abierto, en modo snapshot;
    - después de ingresar con el código simulado: la bandeja (EVALUADOR) y el tablero (JEFATURA).
  - **Opciones**: móvil, 360×740 y `deviceScaleFactor: 2`. El modo oscuro se emula con
    `page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])`.
  - **Salida**: una tabla Markdown con la **mediana** de rendimiento y de accesibilidad por pantalla
    y modo, y las auditorías fallidas.
  - **Usuarios** (análisis U3): lee las claves de `tests/e2e/.datos/usuarios-demo.json`, que crea
    la preparación global de Playwright (`sembrarUsuarios`). Si el archivo no existe o es de otro
    compose, termina con un mensaje claro y no mide. No siembra por su cuenta.
  - **Peso del CSS** (análisis E1): anota también el tamaño, transferido y sin comprimir, del CSS
    que descarga la portada y del que descarga la bandeja.
- [X] T003 Tomar la **línea base y las capturas "antes"** (quickstart §0):
  - compose aislado `-p licencias-medida` con los puertos 8090, 3001, 5434, 6381 y 8026, y
    `ORIENTACION_API_KEY=` vacío en el comando, así que no se usa el proveedor;
  - **en este orden** (análisis U3):
    1. `CAPTURAS=antes` con Playwright. Su preparación global siembra los usuarios de demostración
       en `licencias-medida` (`E2E_PROYECTO=licencias-medida`) y escribe `usuarios-demo.json`.
    2. Luego `lighthouse-medida.mjs --corridas 3 --proyecto licencias-medida`, que usa esos
       usuarios;
  - el resultado va a `docs/08-sprint-2/evidencias/diseno-013/linea-base.md`;
  - al terminar, `docker compose -p licencias-medida down -v`.

  **No se toca el compose de desarrollo** ni `infra/.env`. Commit aparte:
  `docs(013): línea base y capturas antes`.
- [X] T004 Instalar con versión **exacta** (sin `^`) en `apps/web/package.json` y actualizar
      `package-lock.json` (research R-01):
  - `@coreui/react@5.13.1`, `@coreui/coreui@5.9.1` y `@coreui/icons-react@2.3.0` en `dependencies`;
  - `sass@1.107.1` en `devDependencies`.

  Comprobar que no entraron Redux, `react-router-dom`, Chart.js ni simplebar (`npm ls`).
- [X] T005 Jest con CoreUI (research R-10):
  - en `apps/web/jest.config.ts`, `moduleNameMapper` de `'\\.(css|scss)$'` al simulador de estilos;
  - **`matchMedia` en jsdom** (análisis C1): jsdom no tiene `window.matchMedia`, y lo usan
    `useModoColor` y, probablemente, `CSidebar` para saber si es celular.
    - En `apps/web/jest.setup.ts`, un simulador de `matchMedia` que por defecto responde **modo
      claro y escritorio** (`prefers-color-scheme: dark` → `false` y `min-width` → `true`).
    - Un ayudante `apps/web/src/pruebas/medios.ts` con `simularMedios({ oscuro, celular })` para que
      una prueba lo cambie y avise a los escuchas (`change`). Se reinicia en `afterEach`.
    - Sin esto, las pruebas que montan pantallas del personal con `montarEn` podrían fallar todas a
      la vez.
  - **prueba de humo** `apps/web/src/componentes/diseno/coreui-humo.test.tsx`:
    - renderiza `CButton`, `CSidebar` y `CDropdown` de `@coreui/react` con el simulador activo;
    - comprueba que `CSidebar` se monta sin errores en escritorio y con `simularMedios({ celular:
      true })`;
  - solo si falla con un `import` de `node_modules/@coreui/*`, agregar `transformIgnorePatterns` y
    transformar esos `.js`.
- [X] T006 Tema Sass que compila (research R-02 y `contracts/tema.md`):
  - `apps/web/src/estilos/_variables-municipalidad.scss`:
    - `$primary: #0b5394`;
    - variante oscura `#083d6d`;
    - foco `#f2a900`;
    - la pila tipográfica del sistema;
    - `$enable-dark-mode: true` y `$color-mode-type: data`;
  - `apps/web/src/estilos/tema.scss`:
    - importa **solo las partes listadas** de `@coreui/coreui/scss/`;
    - después, `global.css` sin cambios por ahora;
  - `main.tsx` importa `./estilos/tema.scss` en lugar de `./estilos/global.css`;
  - **CSS del personal aparte** (análisis E1): las partes que usa solo el área del personal
    (`sidebar`, `header` con su `toggler`, `dropdown` y `breadcrumb`) van en
    `apps/web/src/estilos/tema-personal.scss`. Ese archivo lo importa el módulo de `DisenoPersonal`
    (T015), no `main.tsx`, para que Vite lo separe junto con `React.lazy` (T016) y el portal público
    no lo descargue. `tema.scss` lleva lo común: variables, reboot, tipografía, grilla, formularios,
    botones, tarjetas, insignias, alertas, tablas y paginación. `DisenoPublico` usa una barra simple
    con las clases de `header` que importe `tema.scss`, o su propio CSS mínimo.

  Deben pasar `npm run build -w apps/web` (anotar el tamaño de CSS y JS de la salida) y las 497
  pruebas.

**Punto de control**: hay línea base, CoreUI está instalado y el tema compila con las pruebas en
verde.

**Estado al cierre de la fase 1 (2026-11-25)**:

- **Línea base**: se tomó **antes de instalar CoreUI**, en el compose aislado y sin el proveedor:
  - 12 capturas "antes";
  - Lighthouse con la mediana de 3 corridas: rendimiento 97 a 99 y accesibilidad 100.

  El medidor se corrigió durante la toma: caché fría en cada navegación (sin borrar las cookies de
  la sesión) y sin rendimiento en modo snapshot. Por pedido de la usuaria, va en el mismo commit de
  la fase (no en uno aparte).
- **CoreUI**: se instaló con versiones exactas y no agregó vulnerabilidades (`npm audit`: las mismas
  26 de antes).
- **Jest**: la prueba de humo pasó **sin** `transformIgnorePatterns`; el simulador de `matchMedia`
  queda en `jest.setup.ts`.
- **Tema**: 18.6 KB con gzip después de acotar utilidades, formularios y ayudantes y de quitar
  `type`, `grid` y `nav`. La configuración común vive en `_configuracion.scss` (`@forward … with`).
- **Capturas**: sin video ni traza en `capturas.spec.ts`, porque el video necesita ffmpeg.

---

## Fase 2: Base (bloquea las historias)

- [X] T007 [P] **Prueba primero** `apps/web/src/componentes/diseno/opcionesMenu.test.ts`: para cada
      uno de los 6 roles, para JEFATURA con todas sus opciones y sin roles, `opcionesDe(roles)`
      devuelve **exactamente** las mismas opciones (etiqueta, ruta y orden) que el `OPCIONES` actual
      de `Menu.tsx`. Después, mover `OPCIONES` y el filtro a
      `apps/web/src/componentes/diseno/opcionesMenu.ts` **sin cambiar ningún valor**.
- [X] T008 [P] **Prueba primero** `componentes/diseno/rutas.test.ts`: `esRutaPersonal` es verdadera en
      `/admin`, `/admin/usuarios/x`, `/personal/caja` y `/perfil`, y falsa en `/`, `/ingresar`,
      `/cambiar-clave`, `/consulta` y `/tramite/identidad`. Después, `componentes/diseno/rutas.ts`.
- [X] T009 [P] **Prueba primero** `componentes/diseno/migas.test.ts`, con el mapa de
      `data-model.md`:
  - `/admin/usuarios/123e4567-…` → `Panel › Usuarios › Ficha del usuario`, **sin** el id;
  - `/personal/expedientes/EXP-2026-000123` → `Expedientes › EXP-2026-000123`;
  - `/personal/inspecciones/abc/resultado` → `Inspecciones › Resultado de la inspección`;
  - un tramo desconocido se omite;
  - el último tramo no tiene ruta.

  Después, `componentes/diseno/migas.ts`.
- [X] T010 [P] `componentes/diseno/iconos.ts`: iconos propios para `CIcon` (menú, usuario, sol, luna,
      medio círculo y cerrar), con trazos SVG simples dibujados a mano. Sin copiar los de
      `@coreui/icons`.
- [X] T011 [P] **Prueba primero** `apps/web/src/estilos/contraste.test.ts`: con la fórmula de WCAG,
      cada pareja de `apps/web/src/estilos/paleta.ts` (texto sobre fondo y texto de botón, en claro
      y oscuro) da 4.5:1 o más (3:1 para componentes de interfaz). Incluye el blanco sobre `#0b5394`,
      el texto primario oscuro sobre el fondo oscuro y el foco `#f2a900` sobre ambos fondos.
      Después, `paleta.ts` con los mismos valores que `_variables-municipalidad.scss` (comentario en
      ambos: "mantener iguales").
      **Sin dos fuentes que se desincronicen** (análisis U2): T039 compila `tema.scss` y compara cada
      color de `paleta.ts` con el valor real de su variable `--cui-*` en el CSS compilado, en modo
      claro (`:root`) y oscuro (`[data-coreui-theme=dark]`). Si alguno difiere, la prueba falla. Así
      el contraste se mide sobre los colores que de verdad se publican.

**Punto de control**: la fuente de las opciones es una sola y las migas no muestran datos
personales.

**Estado al cierre de la fase 2 (2026-11-25)**:

- **Opciones del menú**: `Menu.tsx` lee `opcionesDe` de `opcionesMenu.ts`, adonde se movieron las
  opciones sin cambios. Las pruebas del menú actual siguen en verde.
- **Iconos** (`iconos.ts`): no tienen prueba propia; los cubrirán las de `SelectorModo` y
  `DisenoPersonal` (análisis D1).
- **Foco en modo claro**: la paleta encontró que el contorno de foco #f2a900 sobre blanco da 2.0:1,
  menos que el 3:1 de FR-024. Ya era así antes de la 013. Se resuelve con un **anillo doble** en
  modo claro:
  - anillo interior #083d6d, con 11.1:1 sobre blanco;
  - contorno #f2a900, con 5.5:1 sobre ese anillo.

  `contraste.test.ts` lo exige; el CSS se aplica en T034 (puente) y T041 (modo oscuro).

---

## Fase 3: Historia de usuario 1 - Área de administración para el personal (Prioridad: P1) 🎯 MVP

**Objetivo**: menú lateral por rol, plegable en el celular; barra con el nombre y el desplegable
"Mi perfil" y "Cerrar sesión"; migas de pan; pie.

**Prueba independiente**: con cada rol, el menú lateral tiene las opciones de hoy y el desplegable
funciona. A 360 px el botón abre y cierra el menú, sin desplazamiento horizontal.

### Pruebas de la historia 1 ⚠️

- [X] T012 [P] [US1] `apps/web/src/componentes/diseno/DisenoPersonal.test.tsx`, con `montarEn` y una
      sesión de prueba:
  - el `<nav>` "Menú del personal" tiene las opciones de `opcionesDe(roles)`, con `aria-current` en
    la actual;
  - sin roles, no hay opciones de trabajo;
  - el botón "Mostrar menú" tiene `aria-expanded` y abre el menú; Escape o elegir una opción lo
    cierran;
  - el desplegable con el nombre tiene "Mi perfil" (a `/perfil`) y "Cerrar sesión" (llama a `salir`
    y va a `/ingresar`);
  - **con teclado** (análisis E2):
    - con el foco en el botón del nombre, Enter y Espacio lo abren (`aria-expanded="true"`);
    - las flechas recorren "Mi perfil" y "Cerrar sesión";
    - Escape lo cierra y el foco vuelve al botón.

    Si jsdom no reproduce el posicionamiento de Popper, la parte de las flechas se comprueba en el
    navegador, en T043 (f);
  - las migas tienen `aria-current="page"` en el último tramo;
  - el pie dice "Municipalidad Provincial de Huanta".
- [X] T013 [US1] Ajustar `apps/web/src/componentes/Menu.test.tsx` según research R-11:
  - "Mi perfil" y "Cerrar sesión" se buscan en el desplegable (abriéndolo);
  - las opciones por rol se siguen comprobando en el `<nav>` "Menú del personal";
  - cada ajuste lleva un comentario con su justificación;
  - no se borra ninguna afirmación de comportamiento.

### Implementación de la historia 1

- [X] T014 [US1] `componentes/diseno/DesplegableUsuario.tsx`: `CDropdown`, `CDropdownToggle` (con el
      nombre recortado y `title` completo) y `CDropdownMenu`, con "Mi perfil" (`NavLink`) y "Cerrar
      sesión" (la misma lógica de hoy de `Menu.tsx`: `salir()` y navegar a `/ingresar`).
- [X] T015 [US1] `componentes/diseno/DisenoPersonal.tsx` (`contracts/portal-diseno.md`):
  - `CSidebar` con `visible` y `narrow` en `useState`, sin Redux;
  - **corte de 768 px** (análisis I1): `CSidebar` se oculta por defecto por debajo de `lg` (992 px),
    pero FR-006 dice 768 px. Se configura el corte `md`:
    - la prop de punto de corte de `CSidebar`, si existe en 5.13.1;
    - si no, el Sass de `tema-personal.scss`.

    El `useState` de `abierto` solo se aplica por debajo de 768 px.
  - `CSidebarBrand` con el nombre de la Municipalidad;
  - `<nav aria-label="Menú del personal">` con `CNavItem` y `NavLink` de `react-router`;
  - `CHeader` con `CHeaderToggler` ("Mostrar menú" u "Ocultar menú", `aria-expanded` y
    `aria-controls`), las migas `CBreadcrumb` con `migasDe`, un lugar para el selector de modo
    (US6) y `DesplegableUsuario`;
  - `<main>` con `<Outlet />` y `CFooter`.

  Se cierra con Escape y al elegir una opción. Deben pasar T012 y T013.
- [X] T016 [US1] `apps/web/src/Aplicacion.tsx`: `Diseno` usa `DisenoPersonal` si
      `esRutaPersonal(pathname)`; si no, el diseño público actual (US2 lo reemplaza).
      **`DisenoPersonal` se carga con `React.lazy` y `Suspense`** (análisis E1), para que su código
      y `tema-personal.scss` no lleguen al portal público. Las pruebas que montan pantallas del
      personal esperan con `findBy…`. Si alguna usaba `getBy…` justo después de montar, se ajusta a
      `findBy…` con su justificación (R-11). Retirar
      `Menu.tsx` o dejarlo como reexportación del menú lateral si alguna prueba lo importa. Las
      rutas y `RutaProtegida` no cambian.
- [X] T017 [US1] Estilos del área del personal en `apps/web/src/estilos/tema.scss`:
  - ancho del menú lateral y su modo angosto;
  - barra fija;
  - sin transiciones con `prefers-reduced-motion`;
  - el nombre del usuario recortado con puntos suspensivos;
  - áreas táctiles de 44 px;
  - a 360 px, sin desplazamiento horizontal.
- [X] T018 [US1] Ajustar el E2E según research R-11, con un comentario de justificación:
  - `tests/e2e/apoyo/sistema.ts` (`ingresar`) espera la barra con el nombre (`banner`), no la
    visibilidad del `<nav>` lateral;
  - `tests/e2e/perfil.spec.ts` abre el desplegable para ir a "Mi perfil";
  - revisar que `apoyo/lighthouse-ingreso.cjs` siga encontrando `nav[aria-label="Menú del personal"]`
    en el DOM.

**Punto de control**: el personal trabaja con el diseño nuevo y las pruebas siguen en verde.

**Estado al cierre de la fase 3 (2026-11-25)**:

- **Pruebas**: 567/567 en el portal. El E2E completo pasa contra el compose aislado
  `licencias-medida` (8 recorridos; las 12 capturas solo corren con `CAPTURAS`).
- **Teclado del desplegable** (T012): Enter, Espacio, flechas y Escape se comprueban en jsdom, así que
  la parte (f) de T043 ya no depende de esta tarea.
- **Puntos de referencia**: las pantallas ya traen su `<main>` y su `<header>`. Por eso el contenido va
  en un contenedor sin rol, `CHeader` queda como `<div>` y el pie es un `<footer>`. Así no se repiten
  `main` ni `banner`.
- **Estilos** (T017): van en `tema-personal.scss`, que se carga con el área del personal, y no en
  `tema.scss`, para que no lleguen al portal público (análisis E1). El corte de 768 px se fija con
  `$mobile-breakpoint: md` en `_configuracion.scss`. Peso del área: 18.4 KB de JS y 4.9 KB de CSS con
  gzip; el portal público creció 1 KB.
- **Modo angosto**: las opciones no tienen iconos, así que se muestra su inicial con CSS
  (`data-inicial`). El texto y el nombre accesible del enlace no cambian.
- **`Menu.tsx`** sigue en el diseño público hasta US2 (fase 4), que lo reemplaza por "Ir a mi trabajo".
- **Error encontrado en el navegador**: `CIcon` 2.3.0 lee la variable global `process` cuando recibe
  `content` o `name` (propiedades obsoletas). En Jest existe y no falla; en el navegador tiraba el
  área del personal. Se usa `icon`, y `coreui-humo.test.tsx` comprueba que ningún `CIcon` use las
  obsoletas.
- **Ajustes de pruebas existentes (R-11)**, cada uno con su comentario:
  - `Menu.test.tsx`: las opciones por rol se comprueban montando `/perfil`; "Mi perfil" y "Cerrar
    sesión", en el desplegable. Se agregó una prueba para conservar la afirmación "fuera de /perfil,
    Mi perfil no lleva `aria-current`".
  - `DetalleExpediente.test.tsx`: el historial se busca dentro de `main`, porque las migas también
    son un `<ol>`.
  - `jest.setup.ts` precarga el módulo diferido. Sin eso, la primera prueba de cada archivo podía
    pasar la espera de `findBy…` mientras se compilaba CoreUI.
  - `sistema.ts` (`ingresar`) espera el botón del desplegable del usuario. Los usuarios de
    demostración no traen su nombre, así que no se puede buscar la barra por él.
  - `perfil.spec.ts`: a 360 px abre el menú con "Mostrar menú", comprueba que esté en la pantalla y
    lo cierra con Escape.
  - `lighthouse-ingreso.cjs` no cambia: el `<nav>` sigue en el DOM.

---

## Fase 4: Historia de usuario 2 - Portal ligero para el ciudadano (Prioridad: P1)

**Objetivo**: barra con la Municipalidad y "Acceso del personal" (o "Ir a mi trabajo" con
sesión), pie y "Pregúntanos". Sin menú lateral.

**Prueba independiente**: la portada, el asistente, la consulta y el trámite a 360 px tienen barra,
pie y "Pregúntanos", sin menú lateral ni desplazamiento horizontal.

### Pruebas de la historia 2 ⚠️

- [X] T019 [P] [US2] `apps/web/src/componentes/diseno/DisenoPublico.test.tsx`:
  - la barra tiene "Municipalidad Provincial de Huanta" con enlace a `/`;
  - sin sesión, `<nav aria-label="Acceso del personal">` con su enlace a `/ingresar`, salvo en
    `/ingresar`;
  - con sesión, "Ir a mi trabajo" a `inicioDe(roles)` y no "Acceso del personal";
  - no hay `<nav>` "Menú del personal";
  - el pie;
  - `/ingresar` y `/cambiar-clave` usan este diseño.

  Ajustar las pruebas de "Acceso del personal" de `paginas/Inicio.test.tsx` si dependían de la barra
  fina de la 011: mismo nombre y mismo destino (R-11).

### Implementación de la historia 2

- [X] T020 [US2] `componentes/diseno/DisenoPublico.tsx` (`CHeader`, contenido, `CFooter`) y su uso en
      `Aplicacion.tsx` para las rutas no personales. Retirar `AccesoPersonal.tsx`: lo absorbe la
      barra con el mismo nombre accesible. "Pregúntanos" sigue montado solo en las rutas públicas
      (`esRutaPublica`). Deben pasar T019, `MontajeOrientacion.test.tsx` y las pruebas del chat.
- [X] T021 [US2] Chat y botón en ambos diseños (research R-06):
  - `.boton-preguntanos` con el aspecto `btn btn-primary` (vía el puente de T034 o directo);
  - los colores de `.chat-orientacion*` con `--color-*` (ya mapeadas a `--cui-*`);
  - el `<dialog>` nativo, su lógica y sus pruebas **no cambian**.

**Punto de control**: las dos historias P1 completas. MVP visual.

**Estado al cierre de la fase 4 (2026-11-25)**:

- **Pruebas**: 577/577 en el portal. A 360 px y en escritorio, la portada, el ingreso y la consulta
  no tienen desplazamiento horizontal (revisado con capturas en el compose aislado).
- **Retirados**: `Menu.tsx` y `AccesoPersonal.tsx`, con sus estilos en `global.css`. "Acceso del
  personal" vive en la barra pública con el mismo nombre accesible y el mismo destino.
- **Pie compartido**: el texto vive en `componentes/diseno/pie.ts`, para que el diseño público no
  importe el módulo diferido del área del personal.
- **Estilos** del portal ligero en `estilos/_disenos.scss`, importado al final de `tema.scss`. A 360 px
  la barra queda en una fila: el nombre de la Municipalidad se parte en dos líneas. El pie deja lugar
  abajo para el botón fijo "Pregúntanos".
- **T021**: el botón "Pregúntanos" usa `btn btn-primary`. El chat ya usaba solo variables
  `--color-*`; su paso a `--cui-*` llega con el puente (T034). El `<dialog>`, su lógica y sus pruebas
  no cambiaron.
- **Ajustes de pruebas existentes (R-11)**, con su comentario: `Inicio.test.tsx` ("con sesión no
  aparece" espera "Ir a mi trabajo") y `Menu.test.tsx` ("el portal público sigue abierto" espera
  "Ir a mi trabajo" y comprueba que no hay menú del personal).

---

## Fase 5: Historia de usuario 3 - Tablero de la jefatura y panel del administrador (Prioridad: P2)

**Objetivo**: los indicadores de hoy en tarjetas de CoreUI. `GraficoBarras` se conserva.

**Prueba independiente**: con los datos de prueba de hoy, cada número del tablero y del panel está
en una tarjeta con su nombre. `Tablero.test.tsx` y `Panel.test.tsx` siguen en verde.

- [X] T022 [P] [US3] **Prueba primero** `apps/web/src/componentes/TarjetaIndicador.test.tsx`:
  - el número y el nombre se leen juntos (por ejemplo, `aria-labelledby` o un texto agrupado);
  - con `ruta`, la tarjeta es un enlace con el nombre del indicador;
  - sin `ruta`, no es interactiva.
- [X] T023 [US3] `apps/web/src/componentes/TarjetaIndicador.tsx`: `CCard` con el valor grande, el
      nombre y un acento de color del tema (`variante`: `primary`, `success`, `warning`, `danger`
      o `info`).
- [X] T024 [US3] `apps/web/src/paginas/personal/Tablero.tsx`:
  - los totales e indicadores (los mismos datos de hoy) en una grilla de `TarjetaIndicador`: una
    columna a 360 px y varias desde 768 px;
  - las secciones con `GraficoBarras` y la tabla de tiempos se mantienen.

  Deben pasar `Tablero.test.tsx` y `ReporteLicencias.test.tsx`.
- [X] T025 [US3] `apps/web/src/paginas/admin/Panel.tsx`: sus indicadores en `TarjetaIndicador`, y los
      que hoy son enlaces (por ejemplo, "Cuentas bloqueadas") siguen yendo a la misma pantalla. Debe
      pasar `Panel.test.tsx`.
- [X] T026 [P] [US3] `apps/web/src/componentes/GraficoBarras.tsx` y su CSS: los colores de las barras
      y del texto, con variables del tema (legibles en ambos modos). Sin bibliotecas de gráficos.
      Debe pasar `GraficoBarras.test.tsx`.

**Estado al cierre de la fase 5 (2026-11-25)**:

- **Pruebas**: 587/587 en el portal. `Tablero.test.tsx`, `Panel.test.tsx`, `ReporteLicencias.test.tsx`
  y `GraficoBarras.test.tsx` pasan sin cambios. A 360 px y en escritorio, el tablero y el panel no
  tienen desplazamiento horizontal (revisado con capturas en el compose aislado).
- **`TarjetaIndicador`** es un `<section>` con las clases `card` y `card-body`, porque `CCard`
  siempre es un `<div>`. Así cada tarjeta es una región con el nombre del indicador, que es lo que ya
  buscaban las pruebas del panel. Sin valor (por ejemplo, bloqueos no disponibles) solo muestra el
  detalle.
- **Panel**: las seis tarjetas de hoy pasan a `TarjetaIndicador`, con los mismos datos y textos. El
  único enlace de hoy, "Ver los códigos enviados", sigue en su tarjeta y va a la misma pantalla. No
  se agregaron enlaces nuevos: `ruta` queda disponible y probada, sin uso por ahora.
- **Tablero**: una grilla con "Expedientes presentados" y "Total de ingresos en caja" (los mismos
  totales de hoy). El total dejó de repetirse en la sección "Ingresos en caja". Los gráficos y las
  tablas siguen igual.
- **T026**: la barra usa `--cui-link-color` (#0b5394 en claro, tinte claro en oscuro), la marca
  `--cui-danger` y los textos `--cui-body-color` y `--cui-secondary-color`.
- **Estilos** de las tarjetas en `tema-personal.scss`: una columna a 360 px y varias desde 768 px. Se
  quitaron de `global.css` las clases que ya no se usan (`panel__tarjetas`, `panel__cifra` y
  `tablero__total`).

---

## Fase 6: Historia de usuario 4 - Tablas adaptables e insignias de estado (Prioridad: P2)

**Objetivo**: tablas con estilo de CoreUI que se desplazan dentro de su contenedor, y estados como
insignias de color con su nombre.

**Prueba independiente**: la bandeja a 360 px no desplaza la página y cada estado es una insignia
con texto.

- [ ] T027 [P] [US4] **Prueba primero** `apps/web/src/componentes/InsigniaEstado.test.tsx`: los 13
      estados de `EstadoExpediente` muestran el texto de `ESTADOS` y la clase de su grupo:

  | Grupo | Clase | Estados |
  | --- | --- | --- |
  | En curso | `text-bg-info` | REGISTRADO, EN_EVALUACION, EN_INSPECCION, ITSE_POSTERIOR_PENDIENTE |
  | Requiere acción | `text-bg-warning` | OBSERVADO, PENDIENTE_PAGO |
  | Positivo | `text-bg-success` | PAGADO, APROBADO, LICENCIA_PROVISIONAL, LICENCIA_EMITIDA, FINALIZADO |
  | Negativo | `text-bg-danger` | DENEGADO, DERIVADO_A_FISCALIZACION |

  Un estado sin grupo usa `text-bg-secondary`.
- [ ] T028 [P] [US4] **Prueba primero** `apps/web/src/componentes/TablaAdaptable.test.tsx`: envuelve
      la tabla en un contenedor `table-responsive` y conserva `<caption>` y encabezados.
- [ ] T029 [US4] Implementar `InsigniaEstado.tsx` (`CBadge`) y `TablaAdaptable.tsx`. Usar
      `InsigniaEstado` donde hoy se muestra el estado con `ESTADOS[…]`:
  - `paginas/personal/Expedientes.tsx`, `DetalleExpediente.tsx`, `Alertas.tsx`, `Caja.tsx` e
    `Inspecciones.tsx`;
  - `paginas/tramite/Comprobante.tsx` y `paginas/Verificar.tsx`;
  - `paginas/Consulta.tsx`, si muestra el estado.

  Deben pasar sus pruebas actuales, que buscan el mismo texto.
- [ ] T030 [US4] Poner dentro de `TablaAdaptable`, con las clases `table table-hover`, las tablas de:
  - `componentes/TablaEventos.tsx`;
  - `componentes/ReporteLicencias.tsx`;
  - `paginas/personal/Expedientes.tsx`;
  - `paginas/personal/Auditoria.tsx`;
  - `paginas/admin/FichaUsuario.tsx`;
  - `paginas/personal/Tablero.tsx`.

  Deben pasar sus pruebas. **Conservar `tabla--apilable`** de `TablaEventos`: hoy esa tabla se
  apila en filas en el celular, y su comportamiento a 360 px no debe empeorar.

---

## Fase 7: Historia de usuario 5 - Formularios, botones, avisos y paginación consistentes (Prioridad: P2)

**Objetivo**: el estilo de CoreUI en los componentes compartidos y en las clases comunes, sin
cambiar textos ni etiquetas.

**Prueba independiente**: todas las pruebas actuales en verde. El ingreso, la solicitud, la ficha
de un usuario y la caja se ven con el mismo estilo.

- [ ] T031 [P] [US5] **Prueba primero**, ampliando `apps/web/src/componentes/CampoFormulario.test.tsx`:
  - el control tiene `form-control` (o `form-select` si es un `<select>`);
  - la etiqueta tiene `form-label`;
  - la ayuda, `form-text`;
  - con error, el control tiene `is-invalid` y el error `invalid-feedback`, y siguen
    `aria-invalid` y `aria-describedby` como hoy.
- [ ] T032 [US5] `apps/web/src/componentes/CampoFormulario.tsx`: las clases de CoreUI **por
      dentro**, sin cambiar `id`, etiqueta, ayuda, error ni atributos `aria`. Deben pasar T031 y
      todas las pruebas que usan formularios.
- [ ] T033 [US5] `componentes/Confirmacion.tsx` y la paginación de `Expedientes.tsx`,
      `Auditoria.tsx`, `Usuarios.tsx` y `AuditoriaSeguridad.tsx` (no los pasos del asistente): los botones con `btn` y la paginación con `pagination` y
      `aria-current="page"` en la actual. Mismos textos. Deben pasar sus pruebas.
- [ ] T034 [US5] `apps/web/src/estilos/_puente.scss` (research R-02), importado desde `tema.scss`
      después de `global.css`:
  - `.boton` → `btn btn-primary`;
  - `.boton--secundario` → `btn-outline-primary`;
  - `.boton--claro` → `btn-light`;
  - `.boton--peligro` → `btn-danger`;
  - `.aviso` → `alert alert-info`;
  - `.aviso--error` → `alert-danger`;
  - `.aviso--exito` → `alert-success`;
  - `.tarjeta` → `card` con cuerpo;
  - las tablas `.tabla` → `table`.

  Todo con `@extend` y sin tocar las pantallas. Se mantienen 44 px de alto y el foco
  `--color-foco`.
- [ ] T035 [US5] Retirar de `apps/web/src/estilos/global.css` **solo** los bloques de research R-03
      que CoreUI ya reemplaza: reinicio, `.boton*`, `.aviso*`, `.tarjeta`, `.campo__*`, `.menu*`,
      `.acceso-personal*`, tablas y paginación propias.
  - Mapear `--color-fondo`, `--color-superficie`, `--color-texto`, `--color-texto-suave`,
    `--color-primario`, `--color-borde` y `--color-foco` a las `--cui-*`.
  - Conservar el chat, `.cabecera*`, las fichas, el asistente, el gráfico y `:focus-visible`.
  - Anotar en el mensaje del commit cada bloque retirado y qué lo reemplaza.
- [ ] T036 [US5] Correr todas las pruebas del portal: las 497 originales más las nuevas, en verde.
      Revisar a 360 px (en Playwright o a mano) el ingreso, la solicitud, la caja y la ficha de un
      usuario.

---

## Fase 8: Historia de usuario 6 - Modo claro u oscuro (Prioridad: P2)

**Objetivo**: un selector "Claro", "Oscuro" o "Como el sistema" en las dos barras. Sin elección,
sigue al sistema desde el primer pintado. La elección se recuerda.

**Prueba independiente**: con el sistema en oscuro, el primer pintado es oscuro. Elegir "Claro" y
recargar lo mantiene. El chat abierto se ve bien en ambos modos.

### Pruebas de la historia 6 ⚠️

- [ ] T037 [P] [US6] **Prueba primero** `apps/web/src/sesion/modo-color.test.ts`:
  - `leerModoGuardado()` devuelve `"claro"`, `"oscuro"` o `"sistema"`; un valor ajeno o ausente da
    `"sistema"`;
  - `guardarModo` escribe o borra `licencias-modo-color`;
  - `aplicarModoGuardado()` pone `data-coreui-theme="light"` o `"dark"` en `<html>`, o lo quita;
  - con `localStorage` que lanza un error (al leer y al escribir), nada falla y se usa `"sistema"`.
- [ ] T038 [P] [US6] **Prueba primero** `apps/web/src/sesion/useModoColor.test.tsx` y
      `componentes/diseno/SelectorModo.test.tsx`:
  - las tres opciones `menuitemradio` con `aria-checked`;
  - elegir cambia el atributo y lo anuncia en `aria-live`;
  - el evento `storage` de otra pestaña se aplica;
  - en "sistema", un cambio de `matchMedia` no deja atributo.
- [ ] T039 [P] [US6] **Prueba primero** `apps/web/src/estilos/tema.test.ts` (entorno `node`): compila
      `tema.scss` con `sass.compile` y comprueba que el CSS tiene:
  - las variables oscuras bajo `[data-coreui-theme=dark]` **y** bajo
    `@media (prefers-color-scheme: dark)` con `:root:not([data-coreui-theme])`;
  - `#0b5394` como primario y `#f2a900` en el foco;
  - **ninguna** regla de los componentes que no se importan (por ejemplo, `.modal` o `.toast`);
  - ningún `@import` o `url()` hacia otro dominio.

### Implementación de la historia 6

- [ ] T040 [US6] `apps/web/src/sesion/modo-color.ts` (leer, guardar y aplicar, con `try/catch`) y
      `useModoColor.ts`. En `main.tsx`, `aplicarModoGuardado()` **antes de `createRoot`**, sin
      scripts en línea ni cambios en `index.html`. Deben pasar T037 y T038.
- [ ] T041 [US6] `apps/web/src/estilos/_modo-oscuro.scss`: un mixin propio que emite las variables
      oscuras de CoreUI (los mapas `$*-dark`) y las propias bajo los dos selectores (research R-05).
      En modo oscuro, el texto y los enlaces con el color primario usan su tinte claro (R-07). Debe
      pasar T039, y `contraste.test.ts` sigue en verde.
- [ ] T042 [US6] `componentes/diseno/SelectorModo.tsx` (`CDropdown` con iconos de `iconos.ts`) en
      `DisenoPersonal` y en `DisenoPublico`. El chat, las insignias, las tablas y las barras se ven
      bien en ambos modos (revisión a mano en el navegador).

---

## Fase 9: Pulido, medidas, ADR-012 y cierre

- [ ] T043 E2E `tests/e2e/diseno.spec.ts`, en los proyectos `celular` y `escritorio`:
  - **(a)** para los 6 roles, el `<nav>` "Menú del personal" tiene exactamente sus opciones
    (SC-007);
  - **(b)** a 360 px, el botón del menú lo abre y lo cierra, y no hay desplazamiento horizontal con
    el menú abierto ni cerrado (SC-005);
  - **(c)** con `colorScheme: 'dark'` y sin elección guardada, antes de que React monte (`#raiz`
    vacío, esperado con `page.waitForFunction`), el color de fondo calculado del `body` ya es el
    oscuro (SC-006);
  - **(d)** con la elección "claro" guardada y el sistema en oscuro (análisis U1):
    1. `page.addInitScript` corre antes de cualquier script de la página. Guarda `localStorage`
       con `licencias-modo-color=claro` y registra en `window.__colores` el color de fondo
       calculado del `body` en **cada** `requestAnimationFrame` hasta que `#raiz` tenga contenido.
    2. Con `colorScheme: 'dark'`, se carga `/` y se leen los colores.
    3. Hay **destello** si algún frame registrado tiene el fondo oscuro antes del claro final.

    Lo mismo al revés: elección "oscuro" con el sistema en claro. **Si hay destello, se avisa a la
    usuaria** y se propone el plan B de research R-05; no se aplica sin su aprobación;
  - **(e)** en todas las páginas recorridas, ningún evento `securitypolicyviolation` (FR-003);
  - **(f)** en el proyecto `escritorio` (análisis E2): el desplegable del usuario se abre con Enter,
    se recorre con las flechas, se cierra con Escape y devuelve el foco al botón;
  - **(g)** a 800 px de ancho (análisis I1), el menú lateral está visible sin el botón; a 767 px está
    oculto y el botón lo abre.

  Agregar el escucha de (e) también en `apoyo/sistema.ts`, para que lo usen todos los recorridos.
- [ ] T044 Lighthouse del chat en ambos modos: `tests/e2e/apoyo/lighthouse-chat.mjs` acepta
      `--modo oscuro` (emula `prefers-color-scheme`), y `.github/workflows/e2e.yml` lo corre en modo
      claro y oscuro (accesibilidad ≥ 0.9).
- [ ] T045 Medidas y capturas **"después"** (quickstart §2), en el compose aislado reconstruido:
  - `CAPTURAS=despues`;
  - `lighthouse-medida.mjs --corridas 3 --modos claro,oscuro`;
  - el resultado va a `docs/08-sprint-2/evidencias/diseno-013/despues.md`, con la comparación con
    la línea base pantalla por pantalla.

  Se anota **tal como sale**:

  | Criterio | Meta |
  | --- | --- |
  | SC-002 | Accesibilidad ≥ 90 en ambos modos |
  | SC-003 | Rendimiento ≥ la línea base |
  | SC-004 | Sin fallas de `color-contrast` |

  Se anota también el tamaño del CSS y del JS que descarga la portada, frente a la línea base
  (análisis E1). El objetivo es que el portal público no descargue `tema-personal.scss` ni el código
  de `DisenoPersonal`.

  Si SC-003 no se cumple, se ajusta y se vuelve a medir: por ejemplo, revisando que
  `DisenoPersonal` y `tema-personal.scss` se carguen con `React.lazy` y no lleguen al portal
  público. Al terminar, `down -v`.
- [ ] T046 [P] **ADR-012** "Adopción de CoreUI para el diseño del portal" en
      `docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md`. Va en la fila del resumen y en
      su sección (contexto, alternativas, decisión y consecuencias), con:
  - las versiones fijas y por qué no las últimas;
  - el Sass por partes con el tema propio;
  - lo que se excluyó (Redux, `react-router-dom`, Chart.js, simplebar, `@coreui/icons`);
  - el modo oscuro con `data-coreui-theme` y la media query;
  - la CSP sin cambios;
  - la licencia MIT.
- [ ] T047 [P] Documentación:
  - `README.md`: sección "Diseño del portal (funcionalidad 013)", con el selector de modo y cómo
    medir;
  - `docs/08-sprint-2/README.md` §10: tabla antes y después (rendimiento y accesibilidad por
    pantalla y modo) y enlaces a las capturas;
  - `docs/02-arquitectura-software/` o C4 nivel 2: el portal ahora usa CoreUI (ADR-012).
- [ ] T048 Puertas locales y cierre:
  - `npm run lint && npm run typecheck && npm run formato`;
  - `npm test -w apps/web`, todo en verde;
  - `npm run build -w apps/web`, anotando el tamaño final de CSS y JS frente al de T006;
  - las de la API sin cambios (`npm run cobertura`, `npm run regla-dependencia`), que deben seguir
    igual;
  - marcar las tareas con `[X]` y hacer el commit `chore(013): cierre`.

---

## Dependencias y orden de ejecución

- **Fase 1**: T001 y T002 en paralelo → T003 (línea base, **antes de instalar**) → T004 → T005 →
  T006.
- **Fase 2**: depende de T006. T007 a T011 en paralelo.
- **US1 (fase 3)**: depende de la fase 2. T012 y T013 primero; T014 → T015 → T016; T017 y T018
  después.
- **US2 (fase 4)**: depende de T016, que elige el diseño en `Aplicacion.tsx`.
- **US3 y US4 (fases 5 y 6)**: dependen de T006. Son independientes entre sí. T030 toca
  `Tablero.tsx` después de T024.
- **US5 (fase 7)**: depende de T006. T035 (el retiro de `global.css`) va después de T015, T020 y
  T034, cuando ya existen los reemplazos.
- **US6 (fase 8)**: T040 y T041 dependen de T006; T042 depende de T015 y T020.
- **Fase 9**: después de todas. T045 después de T043 y T044; T048 al final.

### Oportunidades de paralelo

- Fase 1: T001 y T002.
- Fase 2: T007, T008, T009, T010 y T011.
- US3 y US4, entre ellas; dentro de cada una, sus pruebas [P].
- US6: las pruebas T037, T038 y T039 en paralelo.
- Pulido: T046 y T047.

## Ejemplo de paralelo: fase 2

```bash
Tarea: "opcionesMenu.test.ts + opcionesMenu.ts (mover OPCIONES sin cambios)"
Tarea: "rutas.test.ts + rutas.ts (esRutaPersonal)"
Tarea: "migas.test.ts + migas.ts (sin datos personales)"
Tarea: "iconos.ts (trazos propios)"
Tarea: "contraste.test.ts + paleta.ts"
```

## Estrategia de implementación

### MVP: US1 y US2 (P1)

1. Fase 1: línea base y capturas antes, dependencias y tema.
2. Fase 2: opciones, rutas, migas, iconos y paleta.
3. US1: área del personal. US2: portal ligero.
4. **Detenerse y validar**: las 497 pruebas en verde, el E2E ajustado y una revisión a 360 px.

### Entrega incremental

1. MVP: US1 y US2.
2. US3: tablero y panel. US4: tablas e insignias.
3. US5: componentes compartidos y retiro de `global.css`.
4. US6: modo claro y oscuro.
5. Pulido: E2E de diseño, medidas "después", ADR-012, documentación y puertas.

## Notas

- **No tocar**: `apps/api`, `openapi.yaml`, `clienteApi.ts`, `RutaProtegida`, `sesion/inicio.ts`,
  las rutas ni la CSP (`cabeceras-seguridad.conf` y `Caddyfile`).
- **Nunca** copiar archivos completos de la plantilla de CoreUI (FR-027). Se usa solo para leer.
- **Medidas**:
  - siempre en el compose aislado `licencias-medida`, sin la clave del proveedor y sin tocar el
    compose de desarrollo;
  - los resultados se anotan tal como salen.
- Cada prueba ajustada (R-11) lleva un comentario con su justificación.
