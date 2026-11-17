# Contrato: `GET /api/v1/salud`

Fuente de verdad: `docs/06-contrato-api/openapi.yaml` (operación `salud`, esquema `Salud`). Este
documento fija el comportamiento que el contrato no detalla.

## Cambio previo en `openapi.yaml` (antes de programar)

```yaml
      responses:
        '200':
          description: Servicio sano (OK) o degradado (DEGRADADO, solo falla la caché; la instancia sigue recibiendo tráfico, ADR-005).
        '503':
          description: La base de datos no responde; el balanceador deja de enviar tráfico a esta instancia.
```

## Comportamiento

- Público (`security: []`), sin parámetros.
- Comprueba PostgreSQL y Redis **en paralelo**, cada uno con un tiempo límite de 2 s
  (`SALUD_TIMEOUT_MS`). Tiempo total de respuesta < 3 s en cualquier caso.
- Cabeceras: `Content-Type: application/json`, `Cache-Control: no-store`.

| Situación | HTTP | Cuerpo |
|---|---|---|
| Base y caché responden | 200 | `{"estado":"OK","baseDeDatos":"OK","cache":"OK","version":"1.0.0"}` |
| Solo la caché falla o tarda > 2 s | 200 | `{"estado":"DEGRADADO","baseDeDatos":"OK","cache":"CAIDO","version":"1.0.0"}` |
| La base falla o tarda > 2 s (caché OK) | 503 | `{"estado":"CAIDO","baseDeDatos":"CAIDO","cache":"OK","version":"1.0.0"}` |
| Ambas fallan | 503 | `{"estado":"CAIDO","baseDeDatos":"CAIDO","cache":"CAIDO","version":"1.0.0"}` |

## Garantías

- La respuesta cumple exactamente el esquema `Salud` en todos los casos (se valida en las pruebas
  de integración).
- Nunca incluye cadenas de conexión, nombres de host, mensajes de excepción ni trazas (FR-011).
- No guarda estado: el resultado refleja la consulta actual (pasa a `OK` sin reiniciar).
