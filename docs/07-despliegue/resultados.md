# Resultados de las mediciones (007)

Dirección pública: **https://164-90-143-165.sslip.io** (droplet `164.90.143.165`, 2 GB, Ubuntu 24.04).

Las mediciones contra la dirección pública se ejecutan cuando el sistema esté desplegado (tareas
**[servidor]** T027, T034 y T038). Hasta entonces, cada tabla queda con "pendiente". Copie aquí la
salida de cada herramienta y un resumen en el README.

## Puertos expuestos (SC-006)

Comando, desde la computadora de la usuaria (Git Bash):

```bash
sh infra/produccion/verificar-puertos.sh 164.90.143.165
```

| Puerto | Esperado | Resultado |
| --- | --- | --- |
| 22 (SSH) | abierto | pendiente |
| 80 (HTTP → HTTPS) | abierto | pendiente |
| 443 (HTTPS) | abierto | pendiente |
| 3000 (API) | cerrado | pendiente |
| 5432 (PostgreSQL) | cerrado | pendiente |
| 6379 (Redis) | cerrado | pendiente |
| 6432 (PgBouncer) | cerrado | pendiente |

## TLS y cabeceras (SC-010, flujo `calidad-produccion.yml`, job `tls`)

| Comprobación | Esperado | Resultado |
| --- | --- | --- |
| Protocolos ofrecidos | Solo TLS 1.3 | pendiente |
| Certificado | Válido (Let's Encrypt), para `164-90-143-165.sslip.io` | pendiente |
| HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy | Presentes | pendiente |

## Escaneo OWASP ZAP baseline (SC-010, job `zap`)

| Riesgo | Esperado | Resultado |
| --- | --- | --- |
| Alto | 0 | pendiente |
| Medio | 0 | pendiente |
| Bajo / informativo | Revisados y justificados | pendiente |

## Lighthouse móvil, accesibilidad (SC-011, job `lighthouse`)

| Pantalla | Esperado | Resultado |
| --- | --- | --- |
| `/` (inicio) | ≥ 90 | pendiente |
| `/asistente` | ≥ 90 | pendiente |
| `/consulta` | ≥ 90 | pendiente |
| `/verificar/<código>` | ≥ 90 | pendiente |

## Carga con k6 desde un runner de GitHub (SC-007 y SC-008, flujo `k6.yml`)

| Escenario | Réplicas | Usuarios | p95 | Errores | Peticiones/s | Meta |
| --- | --- | --- | --- | --- | --- | --- |
| `eq01-100` (catálogo) | 2 | 100 | pendiente | pendiente | pendiente | p95 ≤ 2 s, < 1 % |
| `eq01-1000` (catálogo) | 2 | 1,000 | pendiente | pendiente | pendiente | p95 ≤ 2 s, < 1 % |
| `eq02-picos` | 1 | 100 → 1,000 | pendiente | pendiente | pendiente | se compara |
| `eq02-picos` | 2 | 100 → 1,000 | pendiente | pendiente | pendiente | p95 ≤ 3 s, < 1 % |

Límite conocido: el droplet tiene 2 GB y 1 procesador. Si con 2 réplicas no sube el número de
peticiones por segundo, se anota aquí. En ese caso, el beneficio medible de la segunda réplica es que el
servicio sigue atendiendo cuando una cae, y que se actualiza sin cortes (SC-008).

## Caída de una réplica (SC-009)

```bash
cd ~/licencias && docker compose stop api-a
for i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code}\n' https://164-90-143-165.sslip.io/api/v1/salud; done
docker compose start api-a
```

Esperado: 20 de 20 respuestas `200`. Resultado: pendiente.

## Respaldo y restauración (FR-026)

Salida de `./restaurar.sh ~/respaldos/<último>.dump` en el servidor: pendiente.

## Pruebas automáticas (sin servidor)

| Prueba | Dónde corre | Estado |
| --- | --- | --- |
| Tablero y reporte (integración, 20 casos) | Local y job `pruebas` del CI | ✅ En verde en local |
| Matriz de permisos y privacidad de la 007 | Job `pruebas` del CI | Escritas; se ejecutan en el CI (la base local estaba detenida para liberar memoria) |
| E2E de las rutas A y B (celular y escritorio) | Flujo `e2e.yml` | Escritos; se ejecutan en el CI |
| `revisar-migraciones.sh` | Local | ✅ Probado con una migración de ejemplo |
