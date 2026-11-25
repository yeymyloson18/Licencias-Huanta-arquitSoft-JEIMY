# Contrato del tema: colores, modos y estilos (013)

## Entrada de estilos

`apps/web/src/main.tsx` importa `./estilos/tema.scss`, el único punto de entrada, en lugar de
`./estilos/global.css`. `tema.scss` carga, en este orden:

1. `_variables-municipalidad.scss`: variables de Sass antes de CoreUI (tabla de abajo).
2. Las partes de `@coreui/coreui/scss/` que se usan (research R-02).
3. `_modo-oscuro.scss`: variables oscuras bajo `[data-coreui-theme=dark]` y bajo
   `@media (prefers-color-scheme: dark) { :root:not([data-coreui-theme]) }`.
4. `global.css`, recortado (research R-03), con sus variables `--color-*` mapeadas a `--cui-*`.
5. `_puente.scss`: aspecto de CoreUI para las clases propias, con `@extend`.

## Colores de la Municipalidad (no los de la plantilla)

| Token | Modo claro | Modo oscuro | Uso |
| --- | --- | --- | --- |
| `$primary` / `--cui-primary` | `#0b5394` | `#0b5394` (fondos de botón) | Botones, enlaces activos, acentos |
| Variante oscura | `#083d6d` | — | `:hover` y `:active` del primario |
| Texto o enlace primario | `#0b5394` | tinte claro del primario (`$primary-text-emphasis-dark`) | Contraste ≥ 4.5:1 sobre el fondo oscuro |
| `--color-foco` / `$focus-ring-color` | `#f2a900` | `#f2a900` | `:focus-visible` (contorno de 3 px) |
| Fondo, superficie, texto y borde | Los de CoreUI en modo claro | Los de CoreUI en modo oscuro | Vía `--color-*` → `--cui-*` |

- **Tipografía**: la pila del sistema. No hay fuentes ni recursos externos (FR-003).
- **Radio**: el actual (`--radio`).

## Modo de color

| Situación | Atributo en `<html>` | Quién lo pone | Primer pintado |
| --- | --- | --- | --- |
| Sin elección guardada | ninguno | — | El CSS sigue a `prefers-color-scheme` (sin JavaScript) |
| Elección "claro" | `data-coreui-theme="light"` | `aplicarModoGuardado()` en `main.tsx`, antes de `createRoot` | Ver el riesgo y el plan B en research R-05 |
| Elección "oscuro" | `data-coreui-theme="dark"` | Ídem | Ídem |

- **Sin scripts ni estilos en línea**: compatible con `script-src 'self'; style-src 'self'` de
  `cabeceras-seguridad.conf` y del Caddyfile de producción. No se cambia ninguna política.

## Lo que se retira de `global.css`

Solo lo que CoreUI reemplaza, con el motivo de research R-03. El commit de cada retiro lo enumera.
