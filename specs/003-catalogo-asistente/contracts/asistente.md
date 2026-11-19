# Contrato: asistente de ruta (`/asistente/preguntas` y `/asistente/proponer`)

Fuente de verdad: `openapi.yaml` (ver [openapi-cambios.md](./openapi-cambios.md)). Decisiones:
[research.md](../research.md) §R-01 y §R-02.

## `GET /asistente/preguntas`

Es pública. Devuelve las preguntas ordenadas por `orden`, con sus opciones tal como están en el
catálogo. Cabecera: `Cache-Control: public, max-age=60`. Se guarda en Redis en `catalogo:asistente`
durante 240 s.

Con los datos semilla actuales, las preguntas son:

| Orden | Código | Opciones (`valor`) |
|---|---|---|
| 1 | `TIPO_ESTABLECIMIENTO` | `BODEGA`, `CORPORATIVO`, `OTRO` |
| 2 | `ES_CESIONARIO` | `SI`, `NO` |
| 3 | `NIVEL_RIESGO` | `BAJO`, `MEDIO`, `ALTO`, `MUY_ALTO`, `NO_SE` |

## `POST /asistente/proponer`

Es pública. Cuerpo: `{ "respuestas": { "<CODIGO_PREGUNTA>": "<valor>" } }`.

| Situación | HTTP | Cuerpo |
|---|---|---|
| Respuestas válidas y la primera regla que coincide apunta a una receta activa | 200 | `{ "resultado": "PROPUESTA", "receta": Receta }` |
| Respuestas válidas y ninguna regla coincide | 200 | `{ "resultado": "NO_DETERMINADA", "motivo": "SIN_REGLA" }` |
| Respuestas válidas y la primera regla que coincide apunta a una receta desactivada | 200 | `{ "resultado": "NO_DETERMINADA", "motivo": "RECETA_NO_DISPONIBLE" }` |
| Falta una pregunta, sobra un código o un valor no está entre las opciones | 422 | `Problema`, con `errores[].campo = "respuestas.<CODIGO>"` |
| Cuerpo con una forma distinta (sin `respuestas`, o con valores que no son texto) | 422 | `Problema`, con `campo = "respuestas"` |

La respuesta lleva `Cache-Control: no-store`. Las respuestas del visitante no se guardan ni se
escriben en los registros.

## Tabla de verdad con la semilla actual (SC-002)

Una prueba unitaria la recorre entera: 3 × 2 × 5 = 30 combinaciones.

| Tipo | Cesionario | Riesgo | Resultado |
|---|---|---|---|
| `BODEGA` | cualquiera | cualquiera | `LIC-09` |
| `CORPORATIVO` | cualquiera | cualquiera | `LIC-05` |
| `OTRO` | `SI` | `MEDIO` / `ALTO` / `MUY_ALTO` | `LIC-06` / `LIC-07` / `LIC-08` |
| `OTRO` | `SI` | `BAJO` | `LIC-01` (no hay licencia para cesionarios de riesgo bajo) |
| `OTRO` | `NO` | `BAJO` / `MEDIO` / `ALTO` / `MUY_ALTO` | `LIC-01` / `LIC-02` / `LIC-03` / `LIC-04` |
| `OTRO` | cualquiera | `NO_SE` | `NO_DETERMINADA / SIN_REGLA` |

Si `LIC-06` está desactivada, la combinación `OTRO` + `SI` + `MEDIO` da
`NO_DETERMINADA / RECETA_NO_DISPONIBLE`; no da `LIC-02`.
