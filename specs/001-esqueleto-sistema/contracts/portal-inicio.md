# Contrato de interfaz: página de inicio del portal

Ruta: `/` del portal web. Consume `GET /api/v1/catalogo/recetas?tipo=LICENCIA` mediante el cliente
tipado generado desde `openapi.yaml` (`packages/contracts`).

## Estados

| Estado | Cuándo | Qué ve el administrado |
|---|---|---|
| Cargando | Mientras llega la respuesta | Texto "Cargando licencias…" con `role="status"` |
| Lista | 200 con ≥ 1 receta | Una tarjeta por licencia: **nombre**, **tasa** (`S/ 159.50`; LIC-09 muestra `S/ 0.00`) y **plazo** (`2 días hábiles`; sin plazo: "Plazo no aplica") |
| Vacío | 200 con arreglo vacío | "Por ahora no hay licencias publicadas en el catálogo. Vuelva a intentarlo más tarde." |
| Error | Error de red, timeout (10 s) o respuesta ≠ 200 | "El catálogo no está disponible en este momento. Vuelva a intentarlo en unos minutos." con `role="alert"` y botón "Reintentar" |

## Reglas de presentación

- Primero celular: a 360 px de ancho no hay desplazamiento horizontal ni se necesita ampliar
  (FR-014); una columna hasta 767 px, cuadrícula desde 768 px.
- `lang="es"`, viewport adaptable, contraste AA, encabezado `h1` único, tarjetas como lista
  (`<ul>`/`<li>`).
- Ningún nombre, tasa ni plazo escrito en el código: todo viene de la respuesta (FR-016).
- Nunca muestra mensajes técnicos (códigos HTTP, trazas) al administrado.
- Meta: Lighthouse ≥ 90 en accesibilidad y buenas prácticas móviles (SC-006).
