# Modelo de datos: Monitoreo de los códigos enviados (010)

## 1. Migración `0013_codigos_enviados` (seguridad.auditoria)

- `ck_auditoria_seg_accion`: se reemplaza por la lista de la 009 más `CODIGO_ENVIADO` y
  `CODIGO_LIMITE_ALCANZADO` (23 acciones).
- Columna nueva `intento_id uuid NULL`: id del desafío del ingreso del personal.
- Índice `ix_auditoria_seg_intento (intento_id) WHERE intento_id IS NOT NULL`.
- Los disparadores de "solo agregar" no cambian. Se refleja en `docs/05` y en `schema.prisma`.

## 2. Acciones nuevas

| Código | Grupo | Texto | Actor | Afectado | Objeto | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| `CODIGO_ENVIADO` | Ingresos | Código enviado | — | la cuenta (personal) | `IDENTIDAD_ADMINISTRADO` (administrado) | `EXITO` si se entregó, `RECHAZADO` si falló |
| `CODIGO_LIMITE_ALCANZADO` | Ingresos | Límite de códigos alcanzado | — | la cuenta (personal) | `IDENTIDAD_ADMINISTRADO` (administrado) | `RECHAZADO` |

## 3. Detalle permitido (se suma al de la 009)

| Clave | Valores | Acciones |
| --- | --- | --- |
| `proposito` | `INGRESO_PERSONAL`, `IDENTIDAD_ADMINISTRADO` | `CODIGO_ENVIADO`, `CODIGO_LIMITE_ALCANZADO` |
| `canal` | `SIMULADO`, `BUZON`, `SMS`, `CORREO` | `CODIGO_ENVIADO` |
| `destino` | celular `^[0-9]\*{5}[0-9]{3}$` o correo `^[^@\s*]{1,2}\*{3}@[^\s@]+$` | `CODIGO_ENVIADO` |
| `entrega` | `ENTREGADO`, `FALLIDO` | `CODIGO_ENVIADO` |
| `segundos` | entero ≥ 0 | también `CODIGO_LIMITE_ALCANZADO` |

`EventoAuditoria` suma `intentoId: string | null` (identificador interno). Solo lo admiten
`CODIGO_ENVIADO`, `INGRESO_CORRECTO`, `CODIGO_INCORRECTO`, `CUENTA_BLOQUEADA` y `ORIGEN_BLOQUEADO`.

## 4. Desenlace (solo lectura)

`INGRESO_CORRECTO | CODIGO_INCORRECTO | BLOQUEO | SIN_USAR | PENDIENTE | ENVIO_FALLIDO`; nulo para
los códigos de identidad entregados y para las demás acciones. Reglas en research §R-03.

## 5. Fila de auditoría

`FilaAuditoria` suma `codigoEnviado: { proposito, canal, destino, entrega, desenlace } | null`.

## 6. Panel

`PanelAdministrador` suma
`codigosEnviados: { hoy: { entregados, conIngreso, fallidos }, ultimos7Dias: { entregados, conIngreso, fallidos } }`.
