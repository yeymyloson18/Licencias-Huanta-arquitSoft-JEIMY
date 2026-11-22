# Cuando haya dominio: DNS, CDN y TLS con Cloudflare

Hoy el sistema usa `<ip-con-guiones>.sslip.io`: un nombre gratuito que apunta a la IP del servidor y
permite un certificado válido de Let's Encrypt. Cuando la Municipalidad entregue un subdominio, o se
compre un dominio, el cambio en el servidor es **un solo valor**: `DOMINIO` en `~/licencias/.env`. El
resto de esta guía configura Cloudflare para tener CDN y protección (ADR-010).

## Qué quedó pendiente por no tener dominio

| Parte de ADR-010 | Estado |
| --- | --- |
| HTTPS con certificado válido (Let's Encrypt) | ✅ Hecho con sslip.io |
| Solo TLS 1.3 entre el ciudadano y el servidor | ✅ Hecho (Caddy, `protocols tls1.3`) |
| Caché de navegador de `/assets/` por un año e `index.html` sin caché | ✅ Hecho (Caddy) |
| DNS delegado a Cloudflare con proxy | ⏳ Pendiente: sslip.io no se puede delegar |
| CDN de Cloudflare para `/assets/` | ⏳ Pendiente |
| TLS "Full (strict)" entre Cloudflare y el servidor | ⏳ Pendiente |
| Origen que solo acepta conexiones desde Cloudflare | ⏳ Pendiente |

## Pasos (cuando exista el dominio)

En los ejemplos, el dominio es `licencias.huanta.gob.pe`.

1. **Agregar el sitio a Cloudflare** (plan Free) y cambiar los servidores de nombres del dominio a los
   que indique Cloudflare. Si es un subdominio de la Municipalidad, ella delega solo ese subdominio.
2. **Registro DNS**: tipo `A`, nombre `licencias`, valor `164.90.143.165` (la IP del droplet), con
   **Proxied** (nube naranja).
3. **SSL/TLS → Overview**: modo **Full (strict)**.
4. **SSL/TLS → Edge Certificates**:
   - *Minimum TLS Version*: **TLS 1.3** (constitución, principio VII);
   - *Always Use HTTPS*: activado.
5. **Caching → Cache Rules**:
   - regla 1: si la ruta empieza con `/assets/`, *Eligible for cache* y *Edge TTL* "respetar el
     origen" (Caddy ya manda un año e `immutable`);
   - regla 2: si la ruta empieza con `/api/`, **Bypass cache**. `index.html` no se guarda porque
     Caddy manda `no-cache`.
6. **Servidor**: cambiar el dominio y los saltos de proxy (Cloudflare suma un salto) en `.env`:

   ```bash
   cd ~/licencias
   sed -i 's/^DOMINIO=.*/DOMINIO=licencias.huanta.gob.pe/' .env
   printf 'TRUST_PROXY_SALTOS=2\n' >> .env
   docker compose up -d
   ```

   Caddy pide un certificado nuevo de Let's Encrypt para el dominio. Cloudflare lo valida en modo
   Full (strict).
7. **Que Caddy confíe en Cloudflare para la IP real**: en `infra/produccion/Caddyfile`, cambiar
   `trusted_proxies static private_ranges` por `trusted_proxies static` seguido de los rangos de
   <https://www.cloudflare.com/ips/>. Abrir un PR con ese cambio para que se despliegue solo.
8. **Origen solo para Cloudflare**: en el cortafuegos de DigitalOcean, cambiar las reglas de 80 y 443
   para que acepten solo los rangos de Cloudflare (la misma lista del paso 7). El puerto 22 sigue
   abierto para el despliegue.
9. **Comprobar**:

   ```bash
   curl -sI https://licencias.huanta.gob.pe/ | grep -i -E 'cf-ray|cache-control'
   curl -sI https://licencias.huanta.gob.pe/assets/<archivo>.js | grep -i cf-cache-status   # HIT a la segunda
   ```

   Luego ejecutar `calidad-produccion.yml` (ZAP, Lighthouse y testssl) con la dirección nueva.

## Volver a sslip.io

Revierta el `DOMINIO` y `TRUST_PROXY_SALTOS=1` en `.env`, y luego `docker compose up -d`.
