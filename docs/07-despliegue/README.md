# Despliegue en la nube (funcionalidad 007)

El sistema se publica en un droplet de DigitalOcean (2 GB, Ubuntu 24.04 LTS) con Docker Compose:

- **IP**: `164.90.143.165`
- **Dirección pública**: **https://164-90-143-165.sslip.io**

Mientras no haya dominio propio, el nombre lo da sslip.io. Para cambiarlo basta con cambiar la variable
`DOMINIO`.

| Documento | Para qué |
| --- | --- |
| [guia-vps.md](guia-vps.md) | Paso a paso para la usuaria: llave SSH, cortafuegos, Docker, usuario de despliegue, `.env`, secretos de GitHub y primer despliegue |
| [dominio-cloudflare.md](dominio-cloudflare.md) | Cuando haya dominio: DNS con proxy, CDN de `/assets/`, TLS Full (strict) y qué quedó pendiente |
| [respaldo-restauracion.md](respaldo-restauracion.md) | Respaldo diario, cómo bajar copias cada semana y cómo restaurar |
| [resultados.md](resultados.md) | Puertos, TLS, ZAP, Lighthouse, k6 y caída de una réplica (se completa al desplegar) |
| [sus.md](sus.md) | Cuestionario de usabilidad SUS para 5 personas y cálculo del puntaje |

## Piezas

```text
Internet ──443/80──► Caddy (portal + HTTPS solo TLS 1.3, caché y compresión)
                        │  /api/*  (balanceo con comprobación de salud)
                        ├──► api-a ─┐
                        └──► api-b ─┴──► PgBouncer (modo transacción) ──► PostgreSQL 16
                                    └──────────────────────────────────► Redis 7
```

- Solo Caddy publica puertos (80 y 443). PostgreSQL, Redis, PgBouncer y la API viven en la red
  interna de Docker.
- Los archivos están en `infra/produccion/`:
  - configuración: `docker-compose.yml`, `Caddyfile` y `.env.ejemplo` (solo nombres de variables);
  - scripts de operación: `desplegar.sh`, `respaldo.sh` y `restaurar.sh`;
  - scripts de comprobación: `verificar-puertos.sh` y `revisar-migraciones.sh`.
- Flujos de GitHub Actions:

  | Flujo | Cuándo corre | Qué hace |
  | --- | --- | --- |
  | `cd.yml` | Cuando el CI de `main` termina en verde | Despliega |
  | `e2e.yml` | En cada PR y en cada push a `main` | Playwright |
  | `k6.yml` | A pedido | Pruebas de carga |
  | `calidad-produccion.yml` | A pedido | ZAP, Lighthouse y testssl |

## Secretos

Ningún secreto está en el repositorio:

- Los de la aplicación (JWT, claves de cifrado y la clave de la base) se generan en el servidor y
  viven solo en `~/licencias/.env`.
- Los del despliegue (llave SSH, huella del servidor, IP y usuario) viven solo en los secretos de
  GitHub.
- Las claves de los usuarios de demostración se muestran una sola vez en la terminal del servidor.

## Lo que queda como siguiente paso

- **Réplica síncrona con Patroni** (ADR-008): necesita al menos dos servidores de base de datos.
- **CDN y DNS de Cloudflare** (ADR-010): necesita un dominio propio.
- **Copia de los respaldos fuera del servidor** (por ejemplo, Spaces): tiene costo.
- **Monitoreo con paneles** (Grafana o Uptime Kuma).
