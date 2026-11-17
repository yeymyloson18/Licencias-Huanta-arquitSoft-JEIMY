# Contrato: `GET /api/v1/catalogo/recetas`

Fuente de verdad: `docs/06-contrato-api/openapi.yaml` (operación `listarRecetas`, esquema
`RecetaResumen`).

## Cambio previo en `openapi.yaml` (antes de programar)

Se agrega la respuesta de validación para un `tipo` fuera del enum:

```yaml
        '422': { $ref: '#/components/responses/NoProcesable' }
```

## Petición

| Parámetro | En | Valores | Obligatorio |
|---|---|---|---|
| `tipo` | query | `LICENCIA`, `TRAMITE_CONECTADO` | No (sin él, devuelve todas las activas) |

Público (`security: []`).

## Respuestas

| Situación | HTTP | Cuerpo |
|---|---|---|
| Correcto | 200 | Arreglo de `RecetaResumen` ordenado por `codigo`; cabecera `Cache-Control: public, max-age=300` |
| `tipo` inválido | 422 | `application/problem+json` (`Problema`) con `errores: [{ "campo": "tipo", "mensaje": "..." }]` |
| Base caída y sin dato en caché | 500 | `Problema` genérico, sin detalles internos |

Ejemplo de elemento (de `datos-semilla.sql`):

```json
{ "codigo": "LIC-01", "nombre": "Licencia de funcionamiento – riesgo bajo", "tipo": "LICENCIA",
  "ruta": "A", "tasa": "159.50", "plazoDias": 2 }
```

## Reglas

- `tasa` siempre como texto con 2 decimales (`Soles`), nunca número de coma flotante.
- `ruta` y `plazoDias` pueden ser `null` (trámites conectados).
- Solo recetas con `activa = true`.
- Caché en Redis por 300 s (clave `catalogo:recetas:<TIPO|TODOS>`); si Redis falla, se lee de la base.
- `GET /catalogo/recetas?tipo=LICENCIA` devuelve exactamente LIC-01 a LIC-09.
