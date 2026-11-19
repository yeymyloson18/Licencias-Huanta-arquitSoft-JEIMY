# Contrato del portal: trámite en línea, consulta y personal

Decisiones: [research.md](../research.md) §R-14. Pantallas pensadas primero para el celular (360 px),
sin estilos en línea (CSP de la 002) y con controles de al menos 44 × 44 px.

## Rutas

| Ruta | Acceso | Contenido |
|---|---|---|
| `/tramite/identidad?licencia=<código>` | pública | Confirmación de identidad en dos pasos (datos → código) |
| `/tramite/solicitud?licencia=<código>` | con permiso de identidad en memoria | Formulario del titular, establecimiento y documentos |
| `/tramite/comprobante/<número>` | después de presentar | Número, licencia, ruta, estado y qué sigue; botón "Imprimir" |
| `/consulta` | pública | Formulario de consulta (POST) y resultado |
| `/personal/expedientes` | MESA_PARTES, EVALUADOR, JEFATURA | Bandeja con filtros |
| `/personal/expedientes/:numero` | mismos roles | Detalle con documentos |
| `/personal/mesa-partes/nueva?licencia=<código>` | MESA_PARTES | Registro presencial (mismo formulario, identidad sin código) |

El menú del personal agrega "Expedientes" (los tres roles) y "Registrar solicitud" (MESA_PARTES).
`FichaLicencia` (003) agrega el botón "Presentar solicitud", que lleva a `/tramite/identidad`.

## Identidad

- Paso 1: tipo de documento (DNI o CE), número, fecha de emisión (solo DNI), RUC, celular y la casilla
  "Actúo como representante legal o apoderado", que muestra los datos del representante.
- Paso 2: código de 6 dígitos (`inputmode="numeric"`, `autocomplete="one-time-code"`), celular
  enmascarado y "Enviar otro código".
- 503: "No pudimos verificar tu identidad en este momento. Puedes acudir a mesa de partes." 429:
  "Demasiados intentos. Puedes volver a intentarlo a las HH:MM".
- El token y la identidad quedan solo en memoria (contexto de React); al recargar la página se
  pierden y se vuelve al paso 1.

## Formulario

- Encabezado con la licencia elegida, su tasa y plazo (de la 003).
- Datos del titular (nombre o razón social, correo opcional) y del establecimiento (nombre comercial
  opcional, giro, dirección, zona, área).
- Documentos en el orden de la receta: obligatorios marcados "Obligatorio"; la carta poder solo si
  actúa un representante; los de giro especial y planos como "Opcional" con su explicación. Cada uno
  con su botón de subir, el estado de la subida (subiendo, listo, rechazado con el motivo) y la
  opción de reemplazarlo.
- Errores junto a cada campo (`aria-describedby`) y en un resumen que recibe el foco.
- "Presentar" se desactiva mientras se envía; el portal genera una `Idempotency-Key` por intento de
  presentación y la reutiliza en los reintentos.
- Si el permiso vence (401) o ya se usó (409), vuelve a la identidad conservando en memoria lo
  escrito.

## Comprobante

Número de expediente grande y copiable, licencia, ruta, estado "Registrado", fecha y "Qué sigue";
se imprime con `@media print` sin el menú.

## Consulta

Número de expediente y documento (DNI, CE o RUC) en un formulario POST; resultado con el estado, su
descripción, el siguiente paso y el historial en una lista ordenada. Mensaje único para datos que no
coinciden; 429 con la hora para reintentar. Nada de esto queda en la URL.

## Bandeja y detalle

Lista en tarjetas en el celular y tabla en pantallas anchas; filtros por estado y ruta que se
reflejan en la URL (no son datos personales); paginación. El detalle muestra los datos, el historial
y los documentos con enlace de descarga.
