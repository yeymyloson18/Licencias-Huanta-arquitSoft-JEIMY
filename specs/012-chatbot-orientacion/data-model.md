# Modelo de datos: Chatbot de orientación (012)

**Sin tablas ni migraciones.** La orientación no guarda preguntas ni respuestas (FR-015 y
FR-017). Usa dos tipos de datos:

- datos en memoria, durante una pregunta;
- contadores en Redis, con vencimiento.

## Objetos del dominio (`modulos/orientacion/dominio/`)

### `PreguntaOrientacion` (objeto de valor)

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `texto` | string | Sin espacios al inicio ni al final; de 1 a 500 caracteres (FR-024). |
| `historial` | `TurnoConversacion[]` | Máximo 6 turnos (FR-013), del más antiguo al más reciente. |

### `TurnoConversacion`

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `rol` | `'PERSONA' \| 'ORIENTADOR'` | — |
| `texto` | string | De 1 a 1,200 caracteres. Se le quitan los datos personales igual que a la pregunta. |
| `codigosReceta` | string[] | Opcional, hasta 4, con el formato de `CodigoReceta`. Las licencias que nombró esa respuesta del chat (FR-027); solo eligen el contexto. |

### `TextoSinDatosPersonales` (resultado de `quitarDatosPersonales`)

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `texto` | string | Correo, celular, RUC, DNI y CE reemplazados por `[dato personal]` (research R-07). |
| `quitados` | boolean | `true` si se reemplazó al menos uno; activa el aviso de FR-016. |

### `ContextoOrientacion` (resultado de `seleccionarContexto`, research R-04)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `licencias` | `LicenciaResumen[]` | Todas las vigentes. |
| `detalle` | `RecetaVigente[]` | Hasta 2, con requisitos. |
| `temas` | `TemaGuia[]` | Hasta 4. |
| `pideRequisitos` | boolean | La pregunta actual pide requisitos o documentos, también con sinónimos (FR-029). |
| `cifrasPermitidas` | `Set<string>` | Montos normalizados (`177.10`) y plazos (`15 dias`, `12 meses`) de **todas las licencias de la tabla**, de las recetas en detalle y de los temas elegidos; los usa `revisarCifras`. |

Cada `LicenciaResumen` tiene `codigo`, `nombre`, `ruta`, `tasa`, `plazoDias`, `tipoPlazo`,
`calificacion` y `ordenItse`.

### `TemaGuia` (de la guía, research R-03)

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `id` | string | `^[a-z0-9-]{3,40}$`, único. |
| `titulo` | string | De 1 a 120 caracteres. |
| `palabrasClave` | string[] | Entre 1 y 20 palabras. |
| `respuesta` | string | De 1 a 1,500 caracteres; revisada por la Municipalidad. |
| `enlaces` | `TipoEnlace[]` | Opcional. |

### `RespuestaModelo` (lo que devuelve el proveedor, validado por `interpretarRespuesta` sin dependencias externas)

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `tipo` | `'RESPONDIDA' \| 'SIN_INFORMACION' \| 'FUERA_DE_TEMA' \| 'CONSULTA_TRAMITE'` | Cualquier otro valor la vuelve inválida. |
| `texto` | string | De 1 a 4,000 caracteres; se recorta a 1,200 al mostrarla. |
| `codigosReceta` | string[] | Opcional. Los que no son licencias vigentes se descartan. |

### `RespuestaOrientacion` (resultado del caso de uso, se mapea a la API)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `resultado` | `ResultadoOrientacion` | `RESPONDIDA`, `SIN_INFORMACION`, `FUERA_DE_TEMA`, `CONSULTA_TRAMITE` o `NO_DISPONIBLE`. |
| `texto` | string | Texto plano. Si el resultado no es `RESPONDIDA`, es un texto fijo del sistema. |
| `enlaces` | `Enlace[]` | `{ tipo: 'FICHA', codigoReceta }`, `{ tipo: 'ASISTENTE' }`, `{ tipo: 'CONSULTA' }` o `{ tipo: 'LICENCIAS' }`. |
| `aclaracion` | string \| null | La aclaración de FR-008 cuando hay datos del TUPA. |
| `datoPersonalQuitado` | boolean | FR-016. |

Además, para los registros (nunca para la respuesta HTTP), el caso de uso devuelve `desenlace`
(`RESPONDIDA`, `SIN_INFORMACION`, `FUERA_DE_TEMA`, `CONSULTA_TRAMITE`, `RECHAZADA_POR_REVISION`,
`TIEMPO_AGOTADO`, `CUOTA_AGOTADA`, `CLAVE_INVALIDA`, `FALLA`, `RESPUESTA_INVALIDA`,
`NO_CONFIGURADO`, `CATALOGO_NO_DISPONIBLE` o `PREGUNTA_TIPO_NEGOCIO`) y `duracionMs`.

### Transiciones del resultado

```text
pregunta válida ─► límite ─ superado ─► 429 (no llega al proveedor)
                    │
                    └─ ok ─► proveedor ─ falla / tiempo / cuota / sin clave / inválida ─► NO_DISPONIBLE
                                 │
                                 └─ RespuestaModelo ─► revisarCifras ─ cifra ajena ─► SIN_INFORMACION
                                                          │
                                                          └─ ok ─► tipo del modelo (+ enlaces del sistema)
```

## Puertos (`dominio/puertos.ts`)

| Puerto | Métodos | Adaptador |
| --- | --- | --- |
| `FuenteCatalogo` | `licenciasVigentes(): Promise<RecetaVigente[]>` | `FuenteCatalogoFachada` (`FachadaCatalogo`, con caché) |
| `FuenteGuia` | `temas(): readonly TemaGuia[]` | `GuiaOrientacionArchivo` (JSON validado al arrancar) |
| `ProveedorOrientacion` | `responder(mensajes): Promise<ResultadoProveedor>` | `ProveedorIaCompatibleOpenAI` (`fetch` y `AbortController`) |
| `LimitadorPreguntas` | `reservar(huella): Promise<{ permitido, segundosRestantes }>` | `LimitadorPreguntasRedis` |
| `Reloj` | `ahora(): number` | El del sistema |

`ResultadoProveedor` es `{ tipo: 'OK', contenido: string }` o `{ tipo: 'TIEMPO_AGOTADO' |
'CUOTA_AGOTADA' | 'CLAVE_INVALIDA' | 'FALLA' | 'RESPUESTA_INVALIDA' | 'NO_CONFIGURADO' }`.

## Redis

| Clave | Valor | Vence | Notas |
| --- | --- | --- | --- |
| `lim:orientacion:<huella>` | Contador de preguntas | 15 min desde la primera (ventana fija) | `huella = hex(HMAC-SHA256(CLAVE_HMAC_DATOS, "orientacion:" + ip))`. Nunca la IP en claro. |

El catálogo se lee con las claves de caché que ya usa el módulo `catalogo`; `orientacion` no las
conoce.

## Configuración

| Variable | Por defecto | Notas |
| --- | --- | --- |
| `ORIENTACION_API_URL` | `https://api.groq.com/openai/v1` (si está vacía) | En producción, si hay clave, debe empezar con `https://`. |
| `ORIENTACION_MODELO` | `openai/gpt-oss-120b` (si está vacía) | — |
| `ORIENTACION_API_KEY` | vacío → chat desactivado | Secreta: solo en `infra/.env`. |
| `ORIENTACION_TIEMPO_MAXIMO_MS` | 15000 | Entre 1000 y 60000. |
| `ORIENTACION_LIMITE_PREGUNTAS` | 10 | Por huella cada 15 min. |
| `ORIENTACION_FORMATO_JSON` | `true` | Envía `response_format: json_object`. |
