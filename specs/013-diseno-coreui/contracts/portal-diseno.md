# Contrato del portal: diseños, componentes y accesibilidad (013)

## Elección del diseño (`Aplicacion.tsx`)

- `esRutaPersonal(pathname)`, para `/admin`, `/admin/*`, `/personal/*` y `/perfil`, usa
  `DisenoPersonal`. Cualquier otra ruta, incluidas `/ingresar` y `/cambiar-clave`, usa
  `DisenoPublico`.
- `AvisoNavegacion` y la lógica de la sesión no cambian. "Pregúntanos" sigue montado solo en las
  rutas públicas (`esRutaPublica`, 012).

## `componentes/diseno/DisenoPersonal.tsx`

```text
┌──────────── CSidebar (nav "Menú del personal") ─┐┌──── CHeader (banner) ───────────────────────┐
│ Marca: Municipalidad Provincial de Huanta      ││ [☰ Mostrar menú] Migas › …   [modo] [Nombre ▾]│
│ NavLink por opción del rol (aria-current)       │├──────────────────────────────────────────────┤
│ …                                               ││ <Outlet /> (contenido)                       │
│ [Plegar menú] (solo escritorio)                 │├──────────────────────────────────────────────┤
└─────────────────────────────────────────────────┘│ CFooter: Municipalidad Provincial de Huanta · │
                                                   │ Sistema de Licencias de Funcionamiento        │
                                                   └──────────────────────────────────────────────┘
```

- **Menú lateral**:
  - `<nav aria-label="Menú del personal">` con un `NavLink` por cada opción de `opcionesDe(roles)`;
    el `aria-current="page"` lo pone `NavLink`;
  - sin roles: no muestra opciones de trabajo.
- **Botón del menú** (`CHeaderToggler`):
  - nombre accesible "Mostrar menú" o "Ocultar menú", con `aria-expanded` y `aria-controls`;
  - visible por debajo de 768 px;
  - en escritorio, el botón "Plegar menú" del pie del menú lateral alterna el modo angosto.
- **Desplegable del usuario** (`CDropdown`):
  - el botón muestra el nombre completo (recortado con puntos suspensivos si no cabe, y con `title`
    completo);
  - contiene `Mi perfil` (enlace a `/perfil`) y `Cerrar sesión` (botón con la lógica de hoy);
  - se abre con Enter o Espacio, se recorre con flechas y se cierra con Escape (CoreUI).
- **Migas**: `CBreadcrumb` con `migasDe(pathname)`. El último tramo lleva `aria-current="page"` y
  los anteriores son enlaces.
- **Selector de modo**: ver más abajo.

## `componentes/diseno/DisenoPublico.tsx`

- **Barra** (`CHeader`):
  - a la izquierda, "Municipalidad Provincial de Huanta" (enlace a `/`);
  - a la derecha, el selector de modo y:
    - sin sesión y fuera de `/ingresar`: `<nav aria-label="Acceso del personal">` con el enlace
      "Acceso del personal" a `/ingresar`;
    - con sesión: el enlace "Ir a mi trabajo" a `inicioDe(roles)`.
- **Contenido**: a todo el ancho.
- **Pie** (`CFooter`): el mismo texto que el del personal.
- **"Pregúntanos"** se mantiene; el contenido conserva su `padding-bottom` (012).

## `componentes/diseno/SelectorModo.tsx`

- **Un solo botón** que alterna entre claro y oscuro (corrección del 2026-11-25: sin
  desplegable ni opción "Como el sistema").
  - En modo claro muestra una luna y su nombre accesible es "Cambiar a modo oscuro"; en modo
    oscuro, un sol y "Cambiar a modo claro".
  - Área táctil de 44 px.
- Usa `useModoColor()`: el modo inicial es el guardado o, sin elección, el del dispositivo.
- Con `aria-live="polite"`, anuncia "Modo oscuro activado" o "Modo claro activado". Sin
  `role="status"`, para no confundirse con el estado de cada pantalla.

## Componentes compartidos (por dentro, FR-016)

| Componente | Cambio | Qué no cambia |
| --- | --- | --- |
| `CampoFormulario` | Clases `form-label`, `form-control` o `form-select`, `form-text`, `invalid-feedback d-block` e `is-invalid` | Etiqueta, `id`, `aria-describedby`, `aria-invalid`, textos |
| `Confirmacion` | Botones `btn` | Textos, `role` y foco |
| `TablaEventos`, `ReporteLicencias` y tablas | Dentro de `TablaAdaptable` (`table-responsive`), con `table table-hover` | `<caption>`, encabezados y textos |
| Paginación (Expedientes, Auditoría y Usuarios) | `pagination`; página actual con `aria-current="page"` | Botones "Anterior" y "Siguiente" con sus textos |
| `InsigniaEstado` (nuevo) | `badge text-bg-*` por grupo | El texto de `ESTADOS` |
| `TarjetaIndicador` (nuevo) | `card` con el número grande y el nombre | Los datos y los enlaces del tablero y del panel |
| Clases propias (`.boton`, `.aviso`, `.tarjeta`…) | Aspecto de CoreUI vía `_puente.scss` | El marcado de cada pantalla |

## Accesibilidad (EQ-05)

Se cumple a 360 px, en ambos modos:

- sin desplazamiento horizontal;
- áreas táctiles de al menos 44 px;
- `:focus-visible` con contorno #f2a900;
- contraste ≥ 4.5:1;
- con `prefers-reduced-motion`, sin transiciones.

El menú lateral cerrado no es alcanzable con el teclado.

**Medida**:

- Lighthouse móvil con accesibilidad ≥ 0.9 en ambos modos (SC-002), incluido el chat abierto en
  modo snapshot;
- Playwright: `scrollWidth <= clientWidth`, primer pintado oscuro (SC-006) y ninguna violación de
  la CSP.
