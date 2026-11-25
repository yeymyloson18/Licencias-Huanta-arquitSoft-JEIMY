# Contrato del portal: chat de orientación (012)

## Dónde aparece

- Montado en `Diseno` (`apps/web/src/Aplicacion.tsx`), después de `<Outlet />`.
- Visible solo en las rutas públicas: `/`, `/asistente`, `/licencias/:codigo`, `/consulta`,
  `/verificar/:codigo` y `/tramite/*`.
- **No** aparece en `/ingresar`, `/perfil`, `/cambiar-clave`, `/admin*` ni `/personal*` (FR-001).
- La conversación vive en el estado de `Diseno`: se conserva al navegar entre páginas públicas y al
  cerrar y abrir el chat, y se pierde al recargar (FR-017). No usa `localStorage`.

## `componentes/orientacion/BotonPreguntanos.tsx`

- `<button type="button" aria-haspopup="dialog" aria-expanded={abierto}>Pregúntanos</button>`.
- Fijo abajo a la derecha, con 44 px de alto como mínimo y foco visible. La página deja un margen
  inferior (`.contenido` con `padding-bottom`) para que el botón no tape el último botón ni el
  último campo.

## `componentes/orientacion/ChatOrientacion.tsx`

- `<dialog>` modal con `aria-labelledby` (título "Pregúntanos sobre licencias").
- A 360 px ocupa toda la pantalla; desde 640 px es un panel de 400 px de ancho.
- Al abrir, el foco va al campo. Escape o el botón "Cerrar" lo cierran y el foco vuelve a
  "Pregúntanos".
- **Saludo** (FR-002): "Hola. Puedo orientarle sobre las licencias de funcionamiento del TUPA 2024
  de Huanta. Es una orientación; no hace falta que escriba su DNI, RUC, celular ni correo."
  Debajo hay 3 preguntas de ejemplo que se pueden pulsar:
  - "¿Qué licencia necesito para una bodega?"
  - "¿Cuánto cuesta y cuánto demora?"
  - "¿Cómo pago?"
- **Campo**: `<textarea>` con la etiqueta "Escriba su pregunta" y `maxLength={500}`. Un contador
  "N de 500" va asociado al campo con `aria-describedby`.
- **Enviar**: un botón "Enviar"; Enter también envía y Mayús + Enter hace un salto de línea. Queda
  desactivado si la pregunta está vacía o mientras espera. Mientras espera muestra "Preparando la
  respuesta…".
- **Mensajes**: lista `<ol>` con "Usted" y "Orientador". El texto se muestra como texto plano con
  saltos de línea; nunca con `dangerouslySetInnerHTML`.
- **Región `aria-live="polite"`**: anuncia cada respuesta y cada error sin mover el foco (FR-026).
- **Enlaces**, armados por el portal según `enlaces[].tipo`:

  | Tipo | Texto | Ruta |
  | --- | --- | --- |
  | `FICHA` | "Ver la ficha de <nombre o código>" | `/licencias/<codigoReceta>` |
  | `ASISTENTE` | "¿Qué licencia necesito?" | `/asistente` |
  | `CONSULTA` | "Consultar mi trámite" | `/consulta` |
  | `LICENCIAS` | "Ver la lista de licencias" | `/#licencias`, o la lista que ya existe en la portada |

  Al seguir un enlace, el chat se cierra y la conversación se conserva.
- **Aclaración** (FR-008): si viene `aclaracion`, se muestra debajo de la respuesta en letra
  secundaria.
- **Aviso de dato personal** (FR-016): si `datoPersonalQuitado`, se muestra "Por su seguridad,
  quitamos sus datos personales de la pregunta. No hace falta escribirlos aquí."
- **Errores del servicio**:

  | Respuesta | Mensaje | Enlaces |
  | --- | --- | --- |
  | 429 | "Hizo muchas preguntas seguidas. Vuelva a intentarlo en N minutos." (N redondeado hacia arriba desde `Retry-After`) | `ASISTENTE` |
  | 503, error de red u otro | El mismo texto de `NO_DISPONIBLE` | `ASISTENTE` y `LICENCIAS` |
  | 422 | "La pregunta debe tener entre 1 y 500 caracteres." No debería pasar, porque el portal ya lo valida. | — |

- **Historial**: envía los últimos 6 turnos ya mostrados. Los textos fijos del sistema también
  cuentan como turnos `ORIENTADOR`.

## Cliente (`servicios/clienteApi.ts`)

`preguntarOrientacion(pregunta, historial)` devuelve uno de estos resultados:

- `{ tipo: 'ok', datos: RespuestaOrientacion }`;
- `{ tipo: 'limite', segundos }`;
- `{ tipo: 'no-disponible' }`.

Usa los tipos generados de `@licencias/contracts`. **No** envía el token del personal: es una
operación pública.

## Accesibilidad (EQ-05, FR-026)

- Sin desplazamiento horizontal a 360×740 con el chat abierto y con 6 mensajes largos.
- Áreas táctiles de 44 px como mínimo, contraste AA y foco visible.
- Lighthouse móvil ≥ 0.9 en `/` con el chat abierto. Se mide en el flujo `E2E` con la misma
  configuración que la 011.
