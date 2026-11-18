# Cambios en `docs/06-contrato-api/openapi.yaml` (antes de programar)

Principio II: estos cambios se hacen primero, en el mismo PR. Después se regeneran los tipos de
`packages/contracts` y se pasa `redocly lint`. Decisiones: [research.md](../research.md) §R-01,
§R-06 y §R-07.

## Operaciones

| Operación | Cambio | Seguridad | Respuestas |
|---|---|---|---|
| `GET /catalogo/recetas` (`listarRecetas`) | La cabecera pasa de `max-age=300` a `public, max-age=60` | pública | 200, 422 |
| `GET /catalogo/recetas/{codigoReceta}` (`obtenerReceta`) | Descripción: "404 si no existe **o está desactivada**". 200 con `Cache-Control: public, max-age=60`; el 404 con `no-store` | pública | 200 `Receta`, 404 |
| `PUT /catalogo/recetas/{codigoReceta}` (`actualizarReceta`) | Responde `RecetaAdmin`. Descripción: "Solo ADMINISTRADOR. Gana el último que guarda. Si no hay cambios, responde 200 sin registrar". Agrega `Cache-Control: no-store` | `bearerPersonal`, rol ADMINISTRADOR | 200 `RecetaAdmin`, 401, 403, 404, 422 |
| `POST /asistente/proponer` (`proponerLicencia`) | 200 con `ResultadoAsistente`; 422 **solo** para respuestas inválidas | pública | 200, 422 |
| `GET /asistente/preguntas` (`obtenerPreguntasAsistente`) | Sin cambios de forma (ahora incluye la opción `NO_SE`); `Cache-Control: public, max-age=60` | pública | 200 |
| **Nueva** `GET /admin/catalogo/recetas` (`listarRecetasAdmin`) | Las 12 recetas, activas y desactivadas, ordenadas por código | `bearerPersonal`, rol ADMINISTRADOR | 200 `RecetaAdminResumen[]`, 401, 403 |
| **Nueva** `GET /admin/catalogo/recetas/{codigoReceta}` (`obtenerRecetaAdmin`) | Receta completa aunque esté desactivada | `bearerPersonal`, rol ADMINISTRADOR | 200 `RecetaAdmin`, 401, 403, 404 |

Las dos operaciones nuevas y el PUT llevan `Cache-Control: no-store`. Las nuevas usan la etiqueta
`[Catálogo]` y el parámetro existente `CodigoReceta`.

## Esquemas

```yaml
RecetaAdminResumen:
  allOf:
    - $ref: '#/components/schemas/RecetaResumen'
    - type: object
      required: [activa, actualizadaEn]
      properties:
        activa: { type: boolean }
        actualizadaEn: { type: string, format: date-time }

RecetaAdmin:
  allOf:
    - $ref: '#/components/schemas/Receta'
    - type: object
      required: [activa, actualizadaEn]
      properties:
        activa: { type: boolean }
        actualizadaEn: { type: string, format: date-time }

ResultadoAsistente:
  oneOf:
    - $ref: '#/components/schemas/PropuestaLicencia'
    - $ref: '#/components/schemas/LicenciaNoDeterminada'
  discriminator:
    propertyName: resultado
    mapping:
      PROPUESTA: '#/components/schemas/PropuestaLicencia'
      NO_DETERMINADA: '#/components/schemas/LicenciaNoDeterminada'

PropuestaLicencia:        # { resultado: PROPUESTA, receta: Receta }, additionalProperties: false
LicenciaNoDeterminada:    # { resultado: NO_DETERMINADA, motivo: SIN_REGLA | RECETA_NO_DISPONIBLE }
```

Las dos variantes son esquemas con nombre (no en línea) porque `redocly lint`
(`no-illogical-composition-keywords`) exige un `$ref` para que el `discriminator` pueda elegirlas.

`RecetaEditable` (se modifica):

```yaml
RecetaEditable:
  type: object
  minProperties: 1
  additionalProperties: false          # nuevo: rechaza nombre, ruta, codigoTupa…
  properties:
    tasa: { $ref: '#/components/schemas/Soles' }
    plazoDias: { type: integer, minimum: 1 }
    calificacion: { type: string, enum: [APROBACION_AUTOMATICA, EVALUACION_PREVIA_SILENCIO_POSITIVO, SERVICIO_EXCLUSIVO] }
    ordenItse: { type: [string, 'null'], enum: [POSTERIOR, PREVIA, DENTRO_6_MESES, null] }   # admite null
    plazoItseDias: { type: [integer, 'null'], minimum: 1 }                                  # admite null
    vigenciaMeses: { type: [integer, 'null'], minimum: 1 }
    activa: { type: boolean }
    requisitos:
      type: array
      minItems: 1
      maxItems: 30
      description: Reemplaza la lista completa. El orden lo da la posición. Con id se conserva el requisito; sin id se crea.
      items:
        type: object
        required: [descripcion, condicion]          # "orden" deja de ser obligatorio
        additionalProperties: false
        properties:
          id: { type: integer }
          orden: { type: integer, minimum: 1, deprecated: true, description: Se ignora; manda la posición. }
          descripcion: { type: string, minLength: 1, maxLength: 500 }
          obligatorio: { type: boolean, default: true }
          condicion: { type: string, enum: [SIEMPRE, CON_REPRESENTANTE, GIRO_ESPECIAL, SIN_PLANOS_VIGENTES] }
```

## Errores 422 de `actualizarReceta`

Es un `Problema` con `errores[]`, una entrada por cada regla incumplida, todas juntas. Valores de
`campo`:
- `tasa`
- `plazoDias`
- `calificacion`
- `ordenItse`
- `plazoItseDias`
- `vigenciaMeses`
- `requisitos`
- `requisitos[2].descripcion`
- `requisitos[0].id`

Ejemplo de la coherencia con la ruta (FR-019):

```json
{ "type": "https://licencias.example.pe/errores/validacion", "title": "Los datos no son válidos",
  "status": 422,
  "errores": [{ "campo": "calificacion",
                "mensaje": "La ruta A exige aprobación automática con ITSE posterior" }] }
```

Los mensajes nunca contienen datos personales.

## `docs/06-contrato-api/README.md`

Se agregan las operaciones nuevas y la regla de los 5 minutos: Redis 240 s más el navegador 60 s.
