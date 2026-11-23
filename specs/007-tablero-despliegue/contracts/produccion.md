# Contrato de producción (007)

Lo que debe cumplir `infra/produccion/` y lo que comprueban `verificar-local.sh` y
`verificar-puertos.sh`.

## Servicios

| Servicio | Imagen | Puertos publicados | Memoria | Salud |
| --- | --- | --- | --- | --- |
| `caddy` (portal y punto de entrada) | `${IMAGEN_PORTAL}:${VERSION}` (etapa `produccion`) | `80`, `443/tcp`, `443/udp` | 128 MB | `wget -qO- http://127.0.0.1:2019/config/` (admin local) |
| `api-a`, `api-b` | `${IMAGEN_API}:${VERSION}` | ninguno | 384 MB c/u | `wget -qO- http://127.0.0.1:3000/api/v1/salud` |
| `migrar` (perfil `migrar`) | `${IMAGEN_API}:${VERSION}` | ninguno | 256 MB | Se ejecuta y termina: `prisma migrate deploy` con la conexión directa |
| `pgbouncer` | `edoburu/pgbouncer:v1.23.1-p3` | ninguno | 32 MB | `pg_isready -h 127.0.0.1 -p 5432` |
| `postgres` | `postgres:16-alpine` | ninguno | 512 MB | `pg_isready` |
| `redis` | `redis:7-alpine` (`--maxmemory 64mb --maxmemory-policy noeviction`) | ninguno | 96 MB | `redis-cli ping` |

Todos los servicios tienen `restart: unless-stopped`. Las APIs dependen de `pgbouncer` y de `redis`
sanos. Caddy no depende de las APIs: si las dos fallan, devuelve 502 en `/api/*` y el portal sigue
cargando.

Volúmenes: `datos-postgres`, `archivos-tramites` (compartido por `api-a` y `api-b`), `caddy-datos`
(certificados) y `caddy-config`.

## Cabeceras (las comprueba `verificar-local.sh`)

| Ruta | Cabeceras esperadas |
| --- | --- |
| `/assets/*.js` | `Cache-Control: public, max-age=31536000, immutable`; `Content-Encoding: zstd` o `gzip` si el cliente lo acepta |
| `/` y rutas del SPA | `Cache-Control: no-cache` |
| `/api/v1/catalogo/...` | `Cache-Control: public, max-age=60` (lo define la API) |
| `/api/v1/expedientes/consultar` | `Cache-Control: no-store` (lo define la API) |
| Todas | `Strict-Transport-Security: max-age=31536000`, la misma `Content-Security-Policy` del portal de desarrollo, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-*`; sin `Server` ni `X-Powered-By` |
| TLS | Solo 1.3: una conexión forzada a TLS 1.2 (`curl --tls-max 1.2`) falla |
| `http://…` | `308` a `https://…` (salvo con `DOMINIO=localhost`, donde Caddy también redirige) |

## Variables

Todas viven en `.env.ejemplo`, solo con su nombre y una explicación; nunca con valores secretos. El
detalle está en [data-model.md](../data-model.md) §6.

## Flujos de GitHub Actions

| Flujo | Disparador | Secretos | Resultado |
| --- | --- | --- | --- |
| `e2e.yml` | `pull_request` y `push` a `main` | ninguno (valores ficticios) | Informe de Playwright y, si falla, capturas, video y trace |
| `cd.yml` | `workflow_run` de `CI` en `main` con `success` | `SSH_LLAVE`, `SSH_HUELLA_SERVIDOR`, `SERVIDOR_IP`, `SERVIDOR_USUARIO` (y `GITHUB_TOKEN` para GHCR) | Imágenes `sha-<7>` en GHCR y servidor actualizado, o vuelta atrás y flujo en rojo |
| `k6.yml` | `workflow_dispatch` (`base_url`, `escenario`, `replicas`) | los de SSH, solo si `replicas=1` | Artefacto `k6-<escenario>-<replicas>` con el resumen JSON |
| `calidad-produccion.yml` | `workflow_dispatch` (`base_url`, `codigo_verificacion`) | ninguno | Artefactos de ZAP (HTML), Lighthouse (JSON y HTML) y testssl (texto) |

`ci.yml` no cambia: sus 5 jobs (`compilacion`, `pruebas`, `cobertura`, `regla-dependencia` y
`contrato`) mantienen el nombre.

## `desplegar.sh <version>`: salida y códigos

- `0`: la versión nueva queda sana.
- `1`: la prueba de humo falló y se volvió a la versión anterior, que queda sana.
- `2`: fallaron las migraciones y no se tocó ninguna réplica.
- `3`: falló también la vuelta atrás, lo que exige intervención; el mensaje explica qué revisar.

Cada paso imprime una línea con la hora y su resultado, sin secretos ni datos personales.

## `respaldo.sh` y `restaurar.sh`

- `respaldo.sh` sale con `0` y deja los dos archivos, o sale con un código distinto de `0` y no borra
  las copias anteriores.
- `restaurar.sh <dump> [--documentos <tar.gz>]` restaura en `licencias_restaurada` e imprime una
  tabla `tabla | viva | restaurada | ok`. Sale con `0` si todas las filas coinciden.
