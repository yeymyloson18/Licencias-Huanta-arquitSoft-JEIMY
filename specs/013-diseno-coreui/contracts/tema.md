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

Solo hay dos modos, "claro" y "oscuro" (corrección del 2026-11-25: no hay opción "Como el
sistema"). La preferencia del dispositivo solo da el valor inicial mientras la persona no elige.

| Situación | Atributo en `<html>` | Quién lo pone | Primer pintado |
| --- | --- | --- | --- |
| Sin elección guardada | ninguno | — | El CSS usa `prefers-color-scheme` como valor inicial (sin JavaScript) |
| Elección "claro" | `data-coreui-theme="light"` | `public/modo-inicial.js` en el `<head>` (T049); después, el botón | Ya en el modo elegido, sin destello |
| Elección "oscuro" | `data-coreui-theme="dark"` | Ídem | Ídem |

- **`public/modo-inicial.js`** (T049, plan B de research R-05 aprobado por la usuaria): script
  clásico externo del mismo origen, cargado en el `<head>` de `index.html` sin `async` ni `defer`.
  Lee la elección dentro de `try/catch` y pone el atributo antes del primer pintado. `main.tsx`
  sigue llamando a `aplicarModoGuardado()`, que da el mismo resultado.

- **El botón** (`SelectorModo`) alterna entre los dos modos. Sin elección guardada, muestra el modo
  del dispositivo. Al usarlo, guarda la elección y pone el atributo; desde ahí, la elección manda
  sobre el dispositivo. No hay forma de volver a "sin elección" desde el portal.
- Si el navegador no deja guardar, la elección vale hasta recargar; al recargar vuelve el modo del
  dispositivo.

- **Sin scripts ni estilos en línea**: compatible con `script-src 'self'; style-src 'self'` de
  `cabeceras-seguridad.conf` y del Caddyfile de producción. No se cambia ninguna política: el script
  de modo inicial es un archivo propio del mismo origen.

## Lo que se retira de `global.css`

Solo lo que CoreUI reemplaza, con el motivo de research R-03. El commit de cada retiro lo enumera.
