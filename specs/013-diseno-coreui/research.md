# Investigación: Diseño visual del portal con CoreUI (013)

Decisiones de la fase 0. Cada una con lo decidido, el motivo y las alternativas descartadas.

## R-01. Paquetes y versiones fijas

- **Decisión**: agregar a `apps/web`, **solo** con versión exacta (sin `^`):

  | Paquete | Tipo | Versión | Publicada |
  | --- | --- | --- | --- |
  | `@coreui/react` | dependencia | `5.13.1` | 2026-10-04 |
  | `@coreui/coreui` | dependencia | `5.9.1` | 2026-10-04 |
  | `@coreui/icons-react` | dependencia | `2.3.0` | 2024-07-14 |
  | `sass` | desarrollo | `1.107.1` | 2026-10-30 |

  Se usan versiones con más de dos semanas publicadas. Las últimas (`@coreui/react` 5.14.0 y
  `@coreui/coreui` 5.10.0, del 2026-11-23) tenían dos días y se descartaron por seguridad de la
  cadena de suministro. `@coreui/react` 5.13.1 pide `@coreui/coreui ^5.9.0` y `@popperjs/core
  ^2.11.8` (lo usan los desplegables), que quedan fijados en `package-lock.json`.
- **Motivo**: es el pedido de la usuaria. CoreUI libre tiene licencia MIT.
- **Excluidos** (FR-026): Redux, `react-router-dom` (el portal usa `react-router` 7, que ya trae
  `NavLink`), Chart.js, `@coreui/react-chartjs`, simplebar y `@coreui/icons`.
- **Iconos**: `@coreui/icons-react` (`CIcon`) dibuja un icono a partir de sus datos SVG. Sin
  `@coreui/icons`, los pocos iconos que hacen falta (menú, usuario, sol, luna, medio círculo y
  cerrar) se definen en `componentes/diseno/iconos.ts`, con trazos propios simples. No se copian los
  iconos de CoreUI.

## R-02. Sass de CoreUI por partes, con un tema propio

- **Decisión**: `apps/web/src/estilos/tema.scss` es el único punto de entrada de estilos, que
  `main.tsx` importa en lugar de `global.css`.
  1. Define los **colores de la Municipalidad** antes de cargar CoreUI: `$primary: #0b5394`,
     `$focus-ring-color` a partir de `#f2a900`, el radio, la tipografía del sistema (sin fuentes
     externas, FR-003) y `$enable-dark-mode: true` con `$color-mode-type: data`.
  2. Importa **solo las partes usadas** de `@coreui/coreui/scss/`: funciones, variables y mapas
     (con sus versiones oscuras), mixins, utilidades, root, reboot, type, grid y containers, forms,
     buttons, dropdown, nav, header, sidebar, breadcrumb, card, badge, alert, pagination, tables,
     close y la API de utilidades acotada a las que se usan (`d-*`, `flex-*`, `gap-*`, `m*`, `p*`,
     `text-*`, `visually-hidden`).

     No se importan: modal, offcanvas, carousel, toast, tooltip, popover, spinners, progress,
     accordion, list-group, placeholders ni el módulo `coreui` completo.
  3. Mapea las variables propias de `global.css` (`--color-fondo`, `--color-superficie`,
     `--color-texto`, `--color-texto-suave`, `--color-primario`, `--color-borde`, `--color-foco`) a
     las de CoreUI (`--cui-tertiary-bg`, `--cui-body-bg`, `--cui-body-color`,
     `--cui-secondary-color`, `--cui-primary`, `--cui-border-color`). Así los estilos propios que
     quedan (chat, cabeceras de página, barras del gráfico) siguen el modo de color sin reescribirse.
  4. Carga `global.css` recortado (R-03) y un parcial de **puente** (`_puente.scss`) que da a las
     clases propias de hoy el aspecto de CoreUI con `@extend`:
     - `.boton` → `.btn .btn-primary`;
     - `.boton--secundario` → `.btn-outline-primary`;
     - `.aviso` → `.alert .alert-info`;
     - `.aviso--error` → `.alert-danger`;
     - `.tarjeta` → `.card .card-body`;
     - las tablas `.tabla` → `.table .table-hover`.

  Así las pantallas que usan esas clases cambian de aspecto sin tocarlas (FR-016).
- **Motivo**: es el pedido de la usuaria (solo lo usado y tema propio). Cuidar el peso del CSS
  protege el rendimiento del portal público (SC-003).
- **Alternativas**:
  - el CSS precompilado de CoreUI: trae todos los componentes (mucho más peso) y los colores de
    la plantilla;
  - reemplazar las clases en cada pantalla: más cambios, más riesgo para las pruebas y contra
    FR-016.

## R-03. Qué se retira de `global.css` (y por qué)

Se retira **solo lo que CoreUI reemplaza**. Cada bloque retirado se anota en el commit y en
`contracts/tema.md`:

| Bloque de `global.css` | Lo reemplaza | Motivo |
| --- | --- | --- |
| Reinicio básico (`body`, `*`, márgenes, `img`) | `reboot` de CoreUI | Duplicado. |
| `.boton`, `.boton--secundario`, `.boton--claro`, `.boton--peligro` | `btn-*` vía el puente | Mismo papel; CoreUI trae estados de foco, deshabilitado y modo oscuro. |
| `.aviso`, `.aviso--error`, `.aviso--exito` | `alert-*` vía el puente | Ídem, con contraste en modo oscuro. |
| `.tarjeta` | `card` vía el puente | Ídem. |
| `.campo__*` (etiqueta, control, ayuda, error) | `form-label`, `form-control`, `form-text`, `invalid-feedback` en `CampoFormulario` | El componente compartido cambia sus clases por dentro. |
| `.menu*`, `.acceso-personal*` | `DisenoPersonal` y `DisenoPublico` | Los menús nuevos reemplazan a los viejos. |
| Estilos de tablas genéricas | `table`, `table-responsive` | Desplazamiento dentro del contenedor (FR-014). |
| Paginación propia | `pagination` | FR-016. |

**Se conserva**:

- el chat de orientación (`.chat-orientacion*`, con sus colores pasados a variables, R-06);
- el `:focus-visible` con `--color-foco`;
- las cabeceras de página (`.cabecera*`), las fichas, el asistente, el gráfico de barras y todo lo
  propio que CoreUI no tiene.

## R-04. Diseños: área del personal y portal ligero

- **Decisión**: en `Aplicacion.tsx`, `Diseno` elige el diseño por ruta, con
  `esRutaPersonal(pathname)` para `/admin*`, `/personal*` y `/perfil`.
  - **`DisenoPersonal`** (`componentes/diseno/DisenoPersonal.tsx`):
    - `CSidebar` con su estado en React: `useState` para abierto (celular) y plegado (escritorio),
      sin Redux;
    - `CSidebarNav` con `NavLink` de `react-router`;
    - `CHeader` con el botón del menú (`aria-expanded`), las migas, el selector de modo y el
      desplegable del usuario (`CDropdown`);
    - `CBreadcrumb`, el contenido y `CFooter`.
  - **`DisenoPublico`** (`componentes/diseno/DisenoPublico.tsx`):
    - `CHeader` con el nombre de la Municipalidad (enlace a `/`), el selector de modo y el enlace de
      acceso: "Acceso del personal", o el enlace a la pantalla de trabajo si hay sesión;
    - el contenido a todo el ancho y `CFooter`;
    - "Pregúntanos" (sin cambios, de la 012).
- **Menú por rol (FR-005)**: las opciones salen de **la misma fuente que hoy**. `OPCIONES` y el
  filtro por roles pasan de `Menu.tsx` a `componentes/diseno/opcionesMenu.ts`, sin cambiar etiquetas,
  rutas, orden ni reglas, y el menú lateral las lee de ahí. `roles.ts` no cambia.
- **Nombres accesibles que se conservan**: el `<nav>` del menú lateral sigue llamándose "Menú del
  personal" (lo usan `Menu.test.tsx`, el E2E y `lighthouse-ingreso.cjs`). El de la barra pública,
  "Acceso del personal" (011).
- **A verificar en la implementación**: si `CSidebar` oculta su contenido de forma accesible en el
  celular (`visibility: hidden`) y qué atributos pone. Con el menú cerrado, el `<nav>` no debe ser
  alcanzable con el teclado.
- **Alternativas**:
  - un solo diseño para todo: el portal público cargaría el menú lateral y empeoraría en el celular;
  - copiar `AppSidebar`, `AppHeader` y `DefaultLayout` de la plantilla: está prohibido (FR-027) y
    usan Redux y `react-router-dom`.

## R-05. Modo claro y oscuro sin destellos, compatible con la CSP

- **Decisión**: `data-coreui-theme` en `<html>`, como pidió la usuaria.
  - **Sin elección guardada** (modo "sistema"): no hay atributo. `tema.scss` emite las variables
    oscuras también bajo `@media (prefers-color-scheme: dark) { :root:not([data-coreui-theme]) {…} }`.
    Como el CSS carga antes que el JavaScript, el **primer pintado ya es correcto** sin script.
  - **Cómo se emite**: CoreUI genera el bloque oscuro con `$color-mode-type: data` bajo
    `[data-coreui-theme=dark]`. Un mixin propio (`_modo-oscuro.scss`) emite las mismas variables
    (los mapas `$*-dark` de CoreUI y las propias) bajo **los dos** selectores, para no duplicarlas a
    mano. Se verifica con una prueba de que el CSS compilado contiene ambos bloques.
  - **Con elección guardada**: `main.tsx` llama a `aplicarModoGuardado()` (`sesion/modo-color.ts`)
    **antes de `createRoot`**. Lee `localStorage` dentro de `try/catch` y pone
    `data-coreui-theme="light"` o `"dark"`. No hay script en línea ni archivos nuevos en `index.html`,
    así que es compatible con `script-src 'self'` de nginx y de Caddy.
  - **Corrección (2026-11-25)**: ya no hay opción "sistema". El botón alterna entre "claro" y
    "oscuro"; sin elección guardada, el modo inicial es el del dispositivo (sin atributo, como
    abajo), y en cuanto la persona elige, se guarda y se respeta.
  - **El hook `useModoColor`**: maneja "claro", "oscuro" y "sistema" (quita el atributo), guarda con
    `try/catch` y escucha el evento `storage` para sincronizar pestañas. No se usa el hook
    `useColorModes` de CoreUI porque no envuelve `localStorage` en `try/catch` y siempre escribe el
    atributo.
- **Riesgo conocido**: `main.tsx` es un módulo (diferido). Si la elección guardada **difiere** del
  sistema, el navegador puede pintar una vez el modo del sistema antes de que corra el módulo. El E2E
  lo mide (SC-006) con la elección guardada contraria al sistema.
  - **Plan B**, solo si el E2E muestra el destello: un script clásico externo `public/modo-inicial.js`
    (unas 10 líneas, `<script src>` en `<head>`, sin `async` ni `defer`). Corre antes del primer
    pintado, sigue sin ser un script en línea y cumple la CSP. Se registraría como desviación
    aprobada por la usuaria.
  - **Resultado (2026-11-25)**: el E2E de la fase 9 (T043 d) **mostró el destello**: 3 a 5 cuadros
    con el fondo del dispositivo, en celular y escritorio y en los dos sentidos. La usuaria aprobó
    el plan B y se aplicó en T049. Con el script, el mismo E2E pasa sin destello (tres corridas
    seguidas).
- **Alternativas**:
  - un script en línea en `index.html`: prohibido por la CSP (`script-src 'self'`) y por la usuaria;
  - solo JavaScript: siempre habría destellos en el modo del sistema.

## R-06. El chat "Pregúntanos" en ambos modos

- **Decisión**: el `<dialog>` nativo, su lógica y sus pruebas de la 012 no cambian. Sus colores
  pasan a variables (`--color-superficie`, `--color-texto` y `--color-borde`, ya mapeadas a CoreUI)
  y su `::backdrop` usa un tono que sirve en los dos modos.
  - El botón "Pregúntanos" toma `.btn .btn-primary`.
  - Se mide con el Lighthouse en modo snapshot de la 012, en modo claro y oscuro (SC-002).

## R-07. Contraste en modo oscuro (FR-024)

- **Decisión**: el primario #0b5394 sobre el fondo oscuro de CoreUI da poco contraste.
  En modo oscuro:
  - el texto y los enlaces con el color primario usan su versión clara (`$primary-text-emphasis-dark`,
    un tinte del 40 %);
  - los botones primarios mantienen el fondo #0b5394 con texto blanco (7.8:1);
  - el foco #f2a900 contrasta en ambos modos.

  Las insignias de estado usan las clases `text-bg-*` de CoreUI, que eligen el color del texto
  según el fondo.
- **Verificación**: la auditoría `color-contrast` de Lighthouse en ambos modos (SC-002 y SC-004) y
  una prueba unitaria que calcula el contraste de las parejas del tema con la fórmula WCAG.

## R-08. Tablero, panel, tablas e insignias

- **Tarjetas de indicadores (FR-013)**: un componente `TarjetaIndicador` (`CCard` con el número
  grande, el nombre y un borde de acento). `Tablero.tsx` y `Panel.tsx` lo usan para sus números; los
  datos y los enlaces no cambian.
  - Las tarjetas se ordenan en una grilla de CoreUI: una columna a 360 px y varias en escritorio.
  - No se usan los `CWidgetStats*` con gráficos (piden Chart.js).
  - `GraficoBarras` sigue igual, con sus colores tomados de variables del tema.
- **Tablas (FR-014)**: un componente `TablaAdaptable` (contenedor `table-responsive`). Las tablas de
  `TablaEventos`, `ReporteLicencias`, `Expedientes`, `Auditoria`, `FichaUsuario` y `Tablero` quedan
  dentro de él, con las clases `table` y `table-hover`.
- **Insignias de estado (FR-015)**: `InsigniaEstado` con un mapa fijo `estado → grupo → clase`:

  | Grupo | Clase | Estados |
  | --- | --- | --- |
  | En curso | `text-bg-info` | Registrado, En evaluación, En inspección, ITSE posterior pendiente |
  | Requiere acción | `text-bg-warning` | Observado, Pendiente de pago |
  | Positivo | `text-bg-success` | Pagado, Aprobado, Licencia provisional, Licencia emitida, Finalizado |
  | Negativo | `text-bg-danger` | Denegado, Derivado a fiscalización |

  El texto es el mismo de `ESTADOS` (`Expedientes.tsx`). Se usa donde hoy se muestra el estado: la
  bandeja, el detalle y la consulta pública.

## R-09. Componentes compartidos por dentro (FR-016)

Cada componente compartido cambia su marcado por dentro, sin cambiar la etiqueta, la ayuda, el
error ni los atributos `aria`:

- **`CampoFormulario`**: `form-label`, `form-control` (o `form-select`), `form-text` e
  `invalid-feedback d-block`, con `is-invalid` cuando hay error.
- **`Confirmacion`, `TablaEventos` y la paginación**: el mismo criterio.

Los `id` y `aria-describedby` no cambian, así que las pruebas por etiqueta y rol siguen valiendo.

## R-10. Jest con CoreUI y Sass

- `moduleNameMapper`: agregar `'\\.(css|scss)$'` al simulador de estilos que ya existe
  (`src/__mocks__/estilo.ts`).
- `@coreui/react` 5 publica CommonJS en `dist/cjs` (`main`), así que **probablemente** no haga falta
  `transformIgnorePatterns`. Si Jest se queja de `import` en `node_modules/@coreui/*`, se agrega
  `transformIgnorePatterns: ['/node_modules/(?!@coreui/)']` y la transformación con ts-jest para
  `.js`. Es la primera comprobación de la implementación.
- `@popperjs/core` funciona en jsdom.
- jsdom sigue sin `showModal` (el chat ya lo resuelve, 012).

## R-11. Pruebas que se ajustan (y por qué)

FR-002 permite ajustar solo lo que dependía de la estructura visual, con su justificación:

| Prueba | Ajuste | Motivo |
| --- | --- | --- |
| `componentes/Menu.test.tsx` | "Mi perfil" y "Cerrar sesión" se buscan en el desplegable de la barra (abriéndolo), no dentro del `<nav>` "Menú del personal". | El pedido mueve esas acciones al desplegable. Las opciones por rol se siguen comprobando en el mismo `<nav>`. |
| `tests/e2e/apoyo/sistema.ts` (`ingresar`) | Espera la barra superior con el nombre del usuario, no la visibilidad del `<nav>` lateral. | A 360 px el menú lateral está oculto hasta abrirlo. |
| `tests/e2e/perfil.spec.ts` | "Mi perfil" se abre desde el desplegable del usuario. | Ídem. |
| Pruebas de `AccesoPersonal` (`Inicio.test.tsx`) | El enlace vive en la barra pública con el mismo nombre. Solo cambia dónde está, no lo que se comprueba. | Reemplaza la barra fina de la 011 (supuesto de la spec). |

Ninguna prueba deja de comprobar un comportamiento. Las pruebas que se agregan se listan en el plan.

## R-12. Línea base, capturas y medidas

- **Antes de cambiar nada**, que es la primera tarea, en un **compose de medición aislado** para no
  tocar los datos de desarrollo de la usuaria:
  - `docker compose -p licencias-medida` con otros puertos (`PUERTO_WEB=8090`,
    `PUERTO_API=3001`, `PUERTO_POSTGRES=5434`, `PUERTO_REDIS=6381`, `PUERTO_BUZON=8026`);
  - `ORIENTACION_API_KEY=` vacío en el entorno del comando, que tiene precedencia sobre
    `infra/.env`, así que la medición no usa el proveedor;
  - siembra de usuarios de demostración en ese proyecto (son datos de prueba).
- **Lighthouse de la línea base**: `tests/e2e/apoyo/lighthouse-medida.mjs`, con un flujo de
  puppeteer, en modo móvil a 360×740 y con la **mediana de 3 corridas** por pantalla:
  - rendimiento y accesibilidad de la portada, el asistente, la consulta, `/ingresar` y el chat
    abierto (modo snapshot);
  - con ingreso por el código simulado: la bandeja de expedientes (EVALUADOR) y el tablero
    (JEFATURA).

  El resultado va a `docs/08-sprint-2/evidencias/diseno-013/linea-base.md`. El mismo script, al
  final, mide en modo claro y oscuro, con `prefers-color-scheme` emulado.
- **Capturas** con Playwright (`tests/e2e/capturas.spec.ts`, solo con `CAPTURAS=antes|despues`):
  portada, chat, ingreso, bandeja, tablero y panel, a 360×740 y 1280×800, en modo claro (antes) y
  claro y oscuro (después). Van a `docs/08-sprint-2/evidencias/diseno-013/{antes,despues}/`.
- **CSP en el E2E**: el compose sirve el portal con `cabeceras-seguridad.conf`. Los recorridos E2E
  fallan si el navegador informa una violación de la política (`securitypolicyviolation`) en
  cualquier página (FR-003).
