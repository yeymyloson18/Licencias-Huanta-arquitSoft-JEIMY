# Contrato del portal: evaluación, caja y auditoría

Pantallas pensadas para el celular (360 px), sin estilos en línea y con controles de 44 × 44 px.

## Detalle del expediente (`/personal/expedientes/:numero`, de la 004)

Botones según rol y estado (solo EVALUADOR decide):

| Estado          | Botones del evaluador                          | Otros roles            |
| --------------- | ---------------------------------------------- | ---------------------- |
| REGISTRADO      | Empezar revisión                               | —                      |
| EN_EVALUACION   | Confirmar riesgo, Observar (si no se observó), Denegar | —              |
| PENDIENTE_PAGO  | Descargar esquela                              | CAJA, JEFATURA: Descargar esquela |
| PAGADO (ruta A o C) | Aprobar, Descargar esquela                 | CAJA, JEFATURA: Descargar esquela |

- Confirmar riesgo abre un diálogo con las licencias del mismo grupo (la presentada marcada) y su
  tasa; Observar y Denegar piden el texto (10 a 1,000 caracteres) con contador.
- Cada acción envía `If-Match` con la `version`; con 409 o 412 recarga el detalle y muestra
  "El expediente cambió mientras lo revisabas".
- Jefatura ve además la sección "Auditoría del expediente".

## Caja (`/personal/caja`, rol CAJA)

1. Campo "Código de la esquela" (`ESQ-EXP-AAAA-NNNNNN`, acepta minúsculas y espacios).
2. Al buscar: número de expediente, titular, licencia, monto y estado. Si ya está pagada, lo dice y no
   ofrece registrar.
3. Campo "Número de recibo" y botón "Registrar pago", con una confirmación que repite el monto y el
   titular.
4. Mensajes claros para 404, 409 (ya pagada o recibo repetido) y 422.

## Auditoría (`/personal/auditoria`, rol JEFATURA)

- Lista de pagos y correcciones con filtro "desde" y "hasta" y paginación: fecha y hora, usuario,
  acción, esquela, recibo.
- Desde un registro de pago, "Corregir recibo": recibo nuevo y motivo obligatorio (10 a 500).

## Consulta pública (`/consulta`, de la 004)

- PENDIENTE_PAGO: "Monto a pagar: S/ …", código de la esquela y el botón "Descargar esquela" (usa el
  `tokenConsulta` de la respuesta; si responde 202, "La esquela se está generando, vuelve a
  intentarlo en unos segundos").
- OBSERVADO: el texto de la observación.

## Menú

"Caja" (CAJA) y "Auditoría" (JEFATURA) se agregan a las opciones del personal.
