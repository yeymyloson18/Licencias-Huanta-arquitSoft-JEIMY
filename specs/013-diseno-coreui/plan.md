# Plan de implementación: Diseño visual del portal con CoreUI

**Rama**: `013-diseno-coreui` | **Fecha**: 2026-11-25 | **Especificación**: [spec.md](spec.md)

**Entrada**: especificación de `specs/013-diseno-coreui/spec.md`.

## Resumen

Solo cambia la capa visual del portal (`apps/web`). Se adopta CoreUI (ADR-012) con tres paquetes en
versiones fijas y `sass` para compilar un **tema propio** con los colores de la Municipalidad, que
importa solo las partes usadas del Sass de CoreUI.

- **Dos diseños, elegidos por ruta**:
  - **área del personal**: menú lateral con las mismas opciones por rol de hoy (estado con React,
    `NavLink` de `react-router`), barra con migas, selector de modo y desplegable del usuario, y pie;
  - **portal ligero**, primero celular: barra con la Municipalidad y "Acceso del personal", pie y
    "Pregúntanos".
- **Componentes compartidos**: cambian por dentro (`CampoFormulario`, `Confirmacion`, tablas y
  paginación). Un parcial de "puente" da a las clases propias de hoy (`.boton`, `.aviso`,
  `.tarjeta`) el aspecto de CoreUI sin tocar cada pantalla.
- **Componentes nuevos**: tarjetas de indicadores para el tablero y el panel, insignias de estado y
  tablas adaptables. `GraficoBarras` se conserva.
- **Modo claro y oscuro** con `data-coreui-theme`:
  - sin elección guardada, el CSS sigue a `prefers-color-scheme`, así que el primer pintado es
    correcto sin JavaScript;
  - con elección guardada, `main.tsx` la aplica antes de montar React, sin scripts en línea y con
    `localStorage` dentro de `try/catch`.
- **Primera tarea**: la línea base de Lighthouse y las capturas "antes", en un compose aislado.

## Contexto técnico

**Lenguaje y versión**: TypeScript estricto (portal React 19 + Vite 8), Sass para el tema.

**Dependencias principales**: React 19, `react-router` 7 (ya están). Se agregan, con versión exacta:

- `@coreui/react@5.13.1`;
- `@coreui/coreui@5.9.1`;
- `@coreui/icons-react@2.3.0`;
- en desarrollo, `sass@1.107.1`.

Ver research R-01.

**Almacenamiento**: solo `localStorage` (`licencias-modo-color`), dentro de `try/catch`. Sin
cambios en el backend ni en la base de datos.

**Pruebas**:

- Jest y Testing Library: las 497 actuales y las nuevas;
- Playwright: los 4 recorridos × 2 tamaños y el nuevo `diseno.spec.ts`;
- Lighthouse: navegación y modo snapshot, en ambos modos;
- capturas con Playwright.

**Plataforma**: portal estático servido por nginx detrás de Caddy, con la CSP actual
(`script-src 'self'; style-src 'self'`).

**Tipo de proyecto**: aplicación web (monorepo). **Solo `apps/web`** y `tests/e2e`.

**Metas de rendimiento**: el rendimiento de Lighthouse móvil de cada pantalla no baja de la línea
base (mediana de 3 corridas, SC-003). Se vigila el tamaño del CSS y del JS en la salida de
`vite build`.

**Restricciones**:

- sin Redux, `react-router-dom`, Chart.js ni simplebar;
- sin copiar archivos de la plantilla;
- sin cambios en rutas, sesión, roles, `RutaProtegida`, `clienteApi`, contrato ni backend;
- sin relajar la CSP;
- los textos y nombres accesibles se conservan.

**Escala y alcance**:

- unas 30 pantallas, a las que les llega el estilo a través de los componentes compartidos y del
  puente;
- unos 10 componentes de diseño nuevos;
- 2 pantallas reorganizadas como tablero (Tablero y Panel).

## Verificación constitucional

*Puerta: debe pasar antes de la fase 0. Se revisa otra vez después del diseño.*

| Principio | Estado | Cómo se cumple |
| --- | --- | --- |
| I. Monolito modular con Clean Architecture | ✅ No aplica al backend | No se toca `apps/api`. El portal sigue con ADR-009 (SPA React + Vite). |
| II. Contrato primero | ✅ | Sin cambios en `openapi.yaml`. `clienteApi` no cambia. |
| III. Modelo de datos por módulo | ✅ | Sin cambios en la base. |
| IV. TypeScript estricto y español | ✅ | Los componentes del diseño se escriben en TypeScript estricto (FR-026), con nombres en español (`DisenoPersonal`, `useModoColor`, `migasDe`). |
| V. Toda tarea incluye su prueba | ✅ | Las pruebas actuales siguen en verde; los ajustes se justifican en research R-11. Hay pruebas nuevas para el modo de color, las migas, el menú por rol, las insignias, el contraste y los diseños, más el E2E nuevo. |
| VI. Escenarios de calidad | ✅ | EQ-05 (accesibilidad en ambos modos, 360 px y contraste), EQ-01 (rendimiento no menor que la línea base), EQ-04 (CSP sin relajar y migas sin datos personales) y EQ-06 (estilo en el tema y en los componentes compartidos). |
| VII. Datos personales | ✅ | Las migas no muestran nombres, correos ni ids de usuario. `localStorage` solo guarda el modo. Sin recursos de terceros. |
| VIII. Flujo Git | ✅ | Rama `013-diseno-coreui`, commits convencionales y PR con CI en verde. |
| ADR-009 (portal SPA) | ✅ | CoreUI se suma como biblioteca de componentes. La decisión se registra en el **ADR-012**. |

**Resultado**: pasa sin excepciones.

**Revisión después del diseño**:

- el diseño no agrega dependencias fuera de las cuatro pedidas (más `@popperjs/core` y `prop-types`,
  que trae `@coreui/react`);
- no hay recursos externos ni estilos o scripts en línea.

Sigue pasando.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/013-diseno-coreui/
├── spec.md
├── plan.md                 # este archivo
├── research.md             # R-01 a R-12
├── data-model.md           # modo de color, menú, migas e insignias
├── quickstart.md           # línea base, puertas, medidas y capturas
├── contracts/
│   ├── portal-diseno.md    # diseños, componentes y accesibilidad
│   └── tema.md             # colores, modos y qué se retira de global.css
├── checklists/requirements.md
└── tasks.md                # fase 2 (/speckit-tasks)
```

### Código fuente

```text
apps/web/
├── package.json                      # + @coreui/react 5.13.1, @coreui/coreui 5.9.1,
│                                     #   @coreui/icons-react 2.3.0; dev: sass 1.107.1 (exactas)
├── jest.config.ts                    # moduleNameMapper .scss (y transformIgnorePatterns si hace falta)
└── src/
    ├── main.tsx                      # importa tema.scss; aplicarModoGuardado() antes de createRoot
    ├── Aplicacion.tsx                # Diseno elige DisenoPersonal o DisenoPublico por ruta
    ├── estilos/
    │   ├── tema.scss                 # entrada: variables, partes de CoreUI, modo oscuro, global, puente
    │   ├── _variables-municipalidad.scss
    │   ├── _modo-oscuro.scss
    │   ├── _puente.scss
    │   └── global.css                # recortado (solo lo que CoreUI no reemplaza)
    ├── sesion/
    │   ├── modo-color.ts             # leer y guardar con try/catch; aplicarModoGuardado()
    │   └── useModoColor.ts
    └── componentes/
        ├── diseno/
        │   ├── DisenoPersonal.tsx    # CSidebar + CHeader + CBreadcrumb + CFooter
        │   ├── DisenoPublico.tsx     # CHeader + CFooter
        │   ├── SelectorModo.tsx
        │   ├── DesplegableUsuario.tsx
        │   ├── opcionesMenu.ts       # OPCIONES y opcionesDe (movidas desde Menu.tsx, sin cambios)
        │   ├── migas.ts
        │   ├── rutas.ts              # esRutaPersonal
        │   └── iconos.ts             # trazos SVG propios para CIcon
        ├── TarjetaIndicador.tsx
        ├── InsigniaEstado.tsx
        ├── TablaAdaptable.tsx
        ├── CampoFormulario.tsx       # clases de CoreUI por dentro
        ├── Menu.tsx                  # pasa a ser el menú lateral, o se retira si DisenoPersonal lo absorbe
        └── AccesoPersonal.tsx        # lo absorbe DisenoPublico, con el mismo nombre accesible

apps/web/src/paginas/personal/Tablero.tsx  # tarjetas de indicadores
apps/web/src/paginas/admin/Panel.tsx       # tarjetas de indicadores
(pantallas con estado)                     # InsigniaEstado donde hoy va el texto del estado

tests/e2e/
├── diseno.spec.ts                    # menú por rol, 360 px, primer pintado, CSP
├── capturas.spec.ts                  # solo con CAPTURAS=antes|despues
├── apoyo/lighthouse-medida.mjs       # línea base y después, ambos modos, mediana de 3
├── apoyo/sistema.ts                  # ingresar espera la barra del usuario (R-11)
└── perfil.spec.ts                    # "Mi perfil" desde el desplegable (R-11)

docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md   # ADR-012
docs/08-sprint-2/evidencias/diseno-013/                         # línea base, después y capturas
```

**Decisión de estructura**: todo vive en `apps/web` y en `tests/e2e`. Los componentes del diseño
van juntos en `componentes/diseno/`. Las opciones del menú siguen siendo una sola fuente.

## Orden de trabajo

1. **Línea base y capturas "antes"**: antes de instalar nada (quickstart §0).
2. Dependencias exactas, Jest (`.scss` y, si hace falta, `transformIgnorePatterns`) y el tema Sass
   compilando, sin cambiar todavía ninguna pantalla.
3. Modo de color: `modo-color.ts`, `useModoColor`, `main.tsx` y `_modo-oscuro.scss`, con sus pruebas.
4. `DisenoPublico` y `DisenoPersonal`, con el ajuste de las pruebas de R-11.
5. Componentes compartidos y puente; retiro de `global.css` según R-03.
6. Tarjetas de indicadores, insignias y tablas adaptables.
7. E2E nuevo, Lighthouse en ambos modos, capturas "después", ADR-012 y el informe.

## Escenarios de calidad

| Escenario | Qué se mide | Herramienta |
| --- | --- | --- |
| EQ-05 | Accesibilidad ≥ 90 en ambos modos (incluido el chat abierto), contraste ≥ 4.5:1, 360 px sin desplazamiento horizontal | Lighthouse (navegación y modo snapshot), prueba de contraste, Playwright |
| EQ-01 | Rendimiento ≥ línea base (mediana de 3) | `lighthouse-medida.mjs` antes y después |
| EQ-04 | Sin violaciones de la CSP; migas sin datos personales | Playwright (`securitypolicyviolation`) y Jest (`migasDe`) |
| EQ-06 | Estilo en el tema y en los componentes compartidos | Revisión del código y diff de las pantallas |

## Seguimiento de complejidad

| Excepción | Por qué hace falta | Alternativa más simple descartada |
| --- | --- | --- |
| Puente de clases propias con `@extend` (`_puente.scss`) | Cumplir FR-016 (estilo en lo compartido) sin tocar las ~30 pantallas, y mantener las pruebas | Cambiar `className` en cada pantalla: más riesgo y contra FR-016 |
| Variables oscuras emitidas bajo dos selectores (atributo y media query) | Primer pintado correcto sin JavaScript y elección forzada con el atributo (FR-021) | Solo con JavaScript: destellos; un script en línea: prohibido por la CSP |
| Compose aislado para medir | Línea base y capturas sin tocar los datos de desarrollo ni usar el proveedor de IA | El compose de desarrollo: el E2E regenera las claves de los usuarios de demostración |
