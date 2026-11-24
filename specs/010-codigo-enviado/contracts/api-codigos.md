# Contrato: cambios de la 010 en `openapi.yaml`

Sin operaciones nuevas. Los permisos no cambian (solo ADMINISTRADOR; 401 y 403).

## `AccionAuditoriaSeguridad`

Suma `CODIGO_ENVIADO` y `CODIGO_LIMITE_ALCANZADO` (23 valores).

## `EventoAuditoriaSeguridad`

Suma la propiedad **requerida** `codigoEnviado` (`null` salvo en `CODIGO_ENVIADO`):

```yaml
CodigoEnviado:
  type: object
  required: [proposito, canal, destino, entrega, desenlace]
  properties:
    proposito: { enum: [INGRESO_PERSONAL, IDENTIDAD_ADMINISTRADO] }
    canal: { enum: [SIMULADO, BUZON, SMS, CORREO] }
    destino: { type: string, example: '9*****321' }
    entrega: { enum: [ENTREGADO, FALLIDO] }
    desenlace:
      type: [string, 'null']
      enum: [INGRESO_CORRECTO, CODIGO_INCORRECTO, BLOQUEO, SIN_USAR, PENDIENTE, ENVIO_FALLIDO, null]
```

Nunca trae el código ni el identificador del intento.

## `PanelAdministrador`

Suma la propiedad requerida `codigosEnviados`:

```yaml
codigosEnviados:
  required: [hoy, ultimos7Dias]
  properties:
    hoy: { $ref: ResumenCodigos }
    ultimos7Dias: { $ref: ResumenCodigos }
ResumenCodigos: { required: [entregados, conIngreso, fallidos], properties: { ...: integer ≥ 0 } }
```

## CSV de `GET /admin/auditoria`

Columnas: `fecha;accion;actor;afectado;objeto;resultado;desenlace`.
