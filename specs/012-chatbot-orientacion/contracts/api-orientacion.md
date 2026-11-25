# Contrato de la API: orientación (012)

Se agrega **primero** a `docs/06-contrato-api/openapi.yaml` (principio II):

- etiqueta nueva `Orientación` ("Chat de orientación sobre licencias de funcionamiento (012)");
- la operación;
- los esquemas `PreguntaOrientacion`, `TurnoConversacion`, `RespuestaOrientacion`,
  `ResultadoOrientacion` y `EnlaceOrientacion`.

Después se generan los tipos con `npm run generar`.

## `POST /orientacion/preguntas`

- `operationId: preguntarOrientacion`, `tags: [Orientación]`, `security: []` (público, FR-003).
- **Sin parámetros en la URL.** La pregunta va en el cuerpo (principio VII).

### Cuerpo (`application/json`, `PreguntaOrientacion`, `additionalProperties: false`)

```yaml
type: object
required: [pregunta]
additionalProperties: false
properties:
  pregunta: { type: string, minLength: 1, maxLength: 500 }
  historial:
    type: array
    maxItems: 6
    default: []
    items:
      type: object
      required: [rol, texto]
      additionalProperties: false
      properties:
        rol: { type: string, enum: [PERSONA, ORIENTADOR] }
        texto: { type: string, minLength: 1, maxLength: 1200 }
        # Corrección de la 012 (FR-027): licencias que nombró esa respuesta del chat.
        codigosReceta:
          type: array
          maxItems: 4
          items: { $ref: '#/components/schemas/CodigoReceta' }
```

Una pregunta que solo tiene espacios responde 422, igual que una vacía.

### 200 (`RespuestaOrientacion`), con la cabecera `Cache-Control: no-store`

```yaml
type: object
required: [resultado, texto, enlaces, aclaracion, datoPersonalQuitado]
additionalProperties: false
properties:
  resultado:
    type: string
    enum: [RESPONDIDA, SIN_INFORMACION, FUERA_DE_TEMA, CONSULTA_TRAMITE, NO_DISPONIBLE]
  texto: { type: string, maxLength: 1200 }
  enlaces:
    type: array
    maxItems: 4
    items:
      type: object
      required: [tipo]
      additionalProperties: false
      properties:
        tipo: { type: string, enum: [FICHA, ASISTENTE, CONSULTA, LICENCIAS] }
        codigoReceta: { $ref: '#/components/schemas/CodigoReceta' }  # solo con FICHA
  aclaracion: { type: [string, 'null'] }
  datoPersonalQuitado: { type: boolean }
```

| `resultado` | `texto` | `enlaces` mínimos |
| --- | --- | --- |
| `RESPONDIDA` | El del modelo, revisado | `FICHA` de cada código válido; `ASISTENTE` si no se determinó la licencia |
| `SIN_INFORMACION` | Fijo: "No tengo esa información. Le recomiendo consultar en Mesa de partes de la Municipalidad Provincial de Huanta." | `LICENCIAS` |
| `FUERA_DE_TEMA` | Fijo: "Solo puedo ayudarle con licencias de funcionamiento de la Municipalidad Provincial de Huanta. Puede preguntarme, por ejemplo, qué licencia necesita o cuánto cuesta." | `ASISTENTE` |
| `CONSULTA_TRAMITE` | Fijo: "Para ver el estado de su trámite use 'Consultar mi trámite' con su número de expediente y su DNI o RUC. Por aquí no puedo ver expedientes." | `CONSULTA` |
| `NO_DISPONIBLE` | Fijo: "En este momento no puedo responder preguntas. Puede usar el asistente '¿Qué licencia necesito?' o ver la lista de licencias." | `ASISTENTE`, `LICENCIAS` |

`aclaracion` (FR-008): "Esta es una orientación. Lo oficial es la ficha de cada licencia y la
Municipalidad." Se incluye cuando `resultado = RESPONDIDA`; en los demás casos es `null`.

### Errores (`application/problem+json`, esquema `Problema`)

| Código | `type` termina en | Cuándo |
| --- | --- | --- |
| 422 | `validacion` (`NoProcesable`) | Pregunta vacía o de más de 500 caracteres, historial con más de 6 turnos o con campos de más. El `detail` **no** repite el texto. |
| 429 | `demasiadas-preguntas` (`DemasiadosIntentos`) | Más de `ORIENTACION_LIMITE_PREGUNTAS` preguntas en 15 min desde la misma huella, con `Retry-After` en segundos. |
| 503 | `orientacion-no-disponible` (`ServicioNoDisponible`) | El límite no se puede comprobar (Redis no responde). |

La descripción de `DemasiadosIntentos` y `ServicioNoDisponible` se amplía para mencionar la 012.

### Garantías comprobadas por las pruebas

- El proveedor nunca recibe DNI, RUC, celular, CE ni correo (pruebas con un proveedor que guarda lo
  que recibe).
- Ni la respuesta ni los registros contienen la pregunta, el historial, la IP ni la clave del
  proveedor.
- Una cifra que no está en el contexto nunca llega al portal (`SIN_INFORMACION`).
- `enlaces[].codigoReceta` es siempre una licencia vigente.

## Postman (humo)

`POST /orientacion/preguntas` con `{}` → 422. No se llama al proveedor.

## README del contrato

- Fila "Orientación" en la matriz de permisos: público, sin rol.
- `preguntarOrientacion` en la lista de operaciones.
