# Investigación: Tablero, despliegue en la nube y pruebas del sistema (007)

Cada decisión indica qué se eligió, por qué y qué alternativas se descartaron.

## R-01. Tiempo de atención de un expediente

- **Decisión**:
  - La atención va desde `presentado_en` hasta la **primera** entrada a uno de los estados
    `APROBADO`, `LICENCIA_EMITIDA`, `LICENCIA_PROVISIONAL` o `DENEGADO`, según el historial.
  - Se cuentan los días hábiles de Lima entre las dos fechas, con la regla de
    `CalendarioHabil.diasHabilesRestantes`: cuenta desde el día siguiente, así que la misma fecha
    da 0.
  - Se restan los días hábiles de cada intervalo en `OBSERVADO` o `PENDIENTE_PAGO`, desde que entra
    hasta que sale.
  - Un expediente cuenta "dentro del plazo" si sus días de atención son ≤ `plazoTupaDias` de su
    receta.
  - Los expedientes de recetas con plazo 0 (aprobación automática) se muestran con el promedio, pero
    su porcentaje dentro del plazo es `null` ("no aplica").
- **Por qué**:
  - Es la misma regla de suspensión del reloj de plazos de la 006 (clarificación de la 006). Así el
    tablero y las alertas no se contradicen.
  - La primera decisión final cubre las tres rutas. En la A y la C la decisión es `APROBADO`; la
    licencia sale enseguida y es automática. En la B es `LICENCIA_EMITIDA` o `DENEGADO`, después de
    la inspección previa, que forma parte del trabajo municipal.
- **Alternativas**:
  - Usar `vence_plazo_en`: se descartó porque cambia al suspender y reanudar.
  - Contar días calendario: se descartó porque el TUPA usa días hábiles.

## R-02. Montos exactos

- **Decisión**:
  - Pagos entrega el monto como texto decimal (`"177.10"`).
  - El dominio de reportes lo convierte a céntimos (`bigint`) con una expresión regular estricta,
    suma en céntimos y vuelve a formatear con 2 decimales (esquema `Soles` del contrato).
  - Solo cuentan los pagos con `pagada_en` dentro del rango.
  - Una corrección de recibo no cambia el monto ni duplica la esquela, porque hay una esquela por
    expediente.
- **Por qué**: `number` acumula errores de redondeo, y `Decimal` de Prisma no puede estar en el
  dominio puro.
- **Alternativas**:
  - `decimal.js`: se descartó por ser otra dependencia innecesaria.
  - Sumar en SQL: se descartó porque `reportes` no consulta el esquema `pagos`.

## R-03. Reglas compartidas en `compartido/dominio`

- **Decisión**:
  - `calendario-habil.ts` (de `plazos`) y `titular-publico.ts` (de `licencias`) pasan a
    `apps/api/src/compartido/dominio/`.
  - Sus pruebas se mueven a `test/unit/compartido/`.
  - Los módulos que los usaban cambian el import.
  - La fachada de Plazos agrega `feriadosEntre(desde, hasta)`, para que reportes construya un solo
    `CalendarioHabil` por consulta en lugar de pedir 10,000 cálculos asíncronos.
  - Trámites usa `titularPublico` para el reporte "en trámite": devuelve solo la forma abreviada, y
    el nombre completo nunca sale del módulo.
- **Por qué**: son reglas puras sin dependencias, y es el mismo patrón que `fecha-lima.ts` en la 006.
  La guía pide reutilizar el `CalendarioHabil` de la 006.
- **Alternativas**: copiar las reglas en `reportes`. Se descartó porque se duplicarían y podrían
  contradecirse.

## R-04. Caché del tablero y del reporte

- **Decisión**:
  - Claves:
    - `rep:tablero:<desde>:<hasta>`;
    - `rep:licencias:<situacion>:<receta|*>:<sha256 corto de giro|zona>`, porque el giro y la zona
      son texto libre.
  - Valor: JSON con vida de 300 s (FR-014).
  - Si Redis falla al leer o escribir, se registra una advertencia sin parámetros y se calcula
    directo.
  - El rango que incluye hoy también se guarda en caché: 5 minutos de retraso es aceptable para un
    tablero.
  - Las respuestas HTTP llevan `Cache-Control: no-store` (FR-015).
- **Por qué**: es el criterio 11 y sigue el patrón del catálogo (003): falla abierta en lecturas no
  críticas (ADR-005).
- **Alternativas**:
  - Vistas materializadas: se descartó porque serían tablas de otro esquema y obligan a refrescarlas.
  - Caché en memoria: se descartó porque cada réplica tendría su propia copia.

## R-05. Punto de entrada en producción: Caddy que también sirve el portal

- **Decisión**:
  - Nueva etapa `produccion` en `apps/web/Dockerfile`: `FROM caddy:2.8-alpine`, con `dist/` en
    `/srv` y `infra/produccion/Caddyfile` en `/etc/caddy/Caddyfile`.
  - La etapa final por defecto sigue siendo nginx, para desarrollo y CI.
  - El Caddyfile:
    - `{$DOMINIO}` con certificado automático (Let's Encrypt, con ZeroSSL de respaldo, como hace
      Caddy por omisión) y `tls { protocols tls1.3 }`: la constitución (principio VII) exige TLS 1.3.
      Los celulares con Android 10 o posterior y los navegadores actuales lo soportan; con Cloudflare,
      el TLS mínimo del borde también se fija en 1.3;
    - `encode zstd gzip`;
    - `/assets/*` con `Cache-Control: public, max-age=31536000, immutable`;
    - `index.html` y rutas del SPA con `no-cache`;
    - `/api/*` hacia `reverse_proxy api-a:3000 api-b:3000` con `lb_policy round_robin`,
      `health_uri /api/v1/salud`, `health_interval 5s`, `fail_duration 10s` y reintentos
      (`lb_try_duration 5s`), sin tocar el `Cache-Control` de la API;
    - las mismas cabeceras de seguridad que `cabeceras-seguridad.conf` más
      `Strict-Transport-Security: max-age=31536000`;
    - `-Server`;
    - límite de cuerpo de 11 MB en `/api/*`.
  - Con `DOMINIO=localhost` (prueba local), Caddy usa su certificado interno.
  - Caddy agrega `X-Forwarded-For` y es un solo salto, así que `TRUST_PROXY_SALTOS=1` sigue sirviendo.
    Con Cloudflare serán 2 saltos, más `trusted_proxies` de Cloudflare (guía).
- **Por qué**:
  - HTTPS automático sin cron de certbot.
  - Un contenedor menos en 2 GB.
  - El nginx de desarrollo apunta a `api:3000` y no arranca si ese host no existe.
  - Una prueba (`verificar-local.sh`) compara las cabeceras de Caddy con las de nginx para que no se
    desincronicen.
- **Alternativas**:
  - nginx + certbot: se descartó porque necesita renovación manual o un cron, y un contenedor más.
  - Traefik: se descartó porque es más pesado y su configuración es menos legible para la usuaria.

## R-06. Dos réplicas y actualización sin corte

- **Decisión**:
  - Dos servicios `api-a` y `api-b` con la misma imagen, `${IMAGEN_API}:${VERSION}`.
  - `desplegar.sh <version>`:
    1. Guarda la versión actual en `.version-anterior`.
    2. Hace `docker compose pull`.
    3. Aplica las migraciones con `docker compose run --rm migrar`, un servicio con perfil que usa
       la conexión **directa** a PostgreSQL (Prisma migrate necesita candados de sesión, que
       PgBouncer en modo transacción no conserva).
    4. Ejecuta `up -d --no-deps api-a` y espera a que esté `healthy`.
    5. Hace lo mismo con `api-b`.
    6. Ejecuta `up -d --no-deps caddy`. La recarga de Caddy dura menos de un segundo.
    7. Hace la prueba de humo `curl -fsS https://$DOMINIO/api/v1/salud` con hasta 10 intentos.
    8. Si falla: `VERSION=$(cat .version-anterior)`, repite los pasos 4 a 6 y termina con código 1.
  - En producción, la imagen de la API no aplica migraciones al arrancar (`command` sin
    `prisma migrate deploy`).
- **Por qué**:
  - Caddy deja de enviar tráfico a la réplica que no responde a `/salud`, así que siempre queda una
    atendiendo (FR-032, SC-012).
  - Las migraciones son aditivas (FR-035), así que la versión anterior sigue funcionando.
- **Alternativas**:
  - Docker Swarm: se descartó porque cambia toda la operación por un solo servidor.
  - `--scale` con `docker rollout`: se descartó porque es un plugin externo sin versión fija.

## R-07. PgBouncer

- **Decisión**:
  - `edoburu/pgbouncer:v1.23.1-p3` con `POOL_MODE=transaction`, `DEFAULT_POOL_SIZE=20`,
    `MAX_CLIENT_CONN=200`, `AUTH_TYPE=scram-sha-256` y el usuario y la clave de las variables.
  - Las APIs usan `DATABASE_URL=postgresql://…@pgbouncer:5432/licencias?pgbouncer=true&connection_limit=10`.
  - `?pgbouncer=true` desactiva las sentencias preparadas de Prisma.
  - Los candados que usa el sistema son por transacción (`pg_try_advisory_xact_lock`), compatibles
    con el modo transacción.
  - `verificar-local.sh` cuenta en `pg_stat_activity` las conexiones de PgBouncer con las 2 réplicas
    bajo carga y comprueba que son ≤ 20.
- **Por qué**: es el criterio 9. Las conexiones a PostgreSQL no crecen con las réplicas (FR-024), y
  ADR-008 ya preveía que la API solo conociera la dirección de PgBouncer.
- **Alternativas**: el pool de Prisma solo. Se descartó porque crece con cada réplica.

## R-08. sslip.io y Let's Encrypt

- **Decisión**:
  - `DOMINIO=<ip-con-guiones>.sslip.io`, por ejemplo `203-0-113-10.sslip.io`.
  - sslip.io responde con la IP incluida en el nombre, y Let's Encrypt valida por HTTP-01 en el
    puerto 80.
  - sslip.io está en la Public Suffix List, así que cada subdominio tiene su propio límite de
    certificados.
  - Si Let's Encrypt falla, Caddy prueba ZeroSSL.
  - El volumen `caddy-datos` guarda los certificados para no pedir uno nuevo en cada reinicio.
- **Por qué**: decisión de la usuaria. Es gratuito, sin cuenta y con certificado válido. Cambiar a
  un dominio es cambiar `DOMINIO`.
- **Alternativas**:
  - Certificado autofirmado: se descartó porque el navegador mostraría una advertencia.
  - nip.io: es equivalente, pero sslip.io acepta guiones, lo que es más claro.

## R-09. Respaldo y restauración

- **Decisión**:
  - `respaldo.sh`, con cron diario a las 03:00 del usuario `despliegue`:
    - `docker compose exec -T postgres pg_dump -U … -Fc licencias` a
      `respaldos/licencias-AAAAMMDD-HHMM.dump` (formato comprimido de pg_dump);
    - `tar czf` del volumen de documentos a `respaldos/documentos-AAAAMMDD-HHMM.tar.gz`, con un
      contenedor `alpine` temporal que monta el volumen en solo lectura;
    - se escribe a un archivo `.parcial` y se renombra al terminar bien;
    - recién después se borran los archivos de más de 7 días (`find -mtime +7`);
    - permisos `600` y carpeta `700`.
  - `restaurar.sh <archivo>`:
    - crea la base `licencias_restaurada`, hace `pg_restore` y compara los conteos de `expediente`,
      `esquela` pagada, `licencia` y las auditorías con la base viva;
    - imprime la tabla y sale con código 1 si alguno difiere;
    - con `--reemplazar`, restaura sobre la base real, después de una confirmación escrita.
  - La guía explica cómo bajar copias con `scp` desde PowerShell cada semana (clarificación).
- **Por qué**: es el criterio 9 y EQ-03. Sin los documentos, el expediente restaurado queda
  incompleto.
- **Alternativas**:
  - Volcados `pg_dumpall`: se descartó porque son más grandes y en texto plano.
  - Copias en un almacenamiento externo (Spaces): son de pago y quedan como siguiente paso.

## R-10. Despliegue continuo

- **Decisión**:
  - `cd.yml` se dispara con `workflow_run` del flujo `CI` (`types: [completed]`, `branches: [main]`)
    y solo continúa si `conclusion == 'success'`. Así no despliega si algún check falla (FR-032,
    historia 6, escenario 5).
  - Pasos:
    1. `docker/build-push-action` construye la API (etapa `final`) y el portal (etapa `produccion`)
       con las etiquetas `sha-<7>` y `latest`, y las publica en
       `ghcr.io/<owner>/licencias-huanta-{api,portal}`.
    2. Se instala la llave privada desde `secrets.SSH_LLAVE` y se fija `known_hosts` con
       `secrets.SSH_HUELLA_SERVIDOR`, sin `StrictHostKeyChecking=no`.
    3. Se copian `infra/produccion/{docker-compose.yml,Caddyfile,desplegar.sh,respaldo.sh,restaurar.sh}`
       con `scp`.
    4. Se hace el login del servidor en GHCR con el `GITHUB_TOKEN` del job
       (`echo … | ssh … docker login --password-stdin`), que caduca al terminar.
    5. Se ejecuta `ssh … ./desplegar.sh sha-<7>`.
  - `concurrency: produccion`, sin cancelar el despliegue en curso.
  - Se usa `environment: produccion`, para que la usuaria pueda pedir aprobación manual si quiere.
  - Secretos: `SSH_LLAVE`, `SSH_HUELLA_SERVIDOR`, `SERVIDOR_IP` y `SERVIDOR_USUARIO`. Los secretos
    de la aplicación viven solo en el `.env` del servidor.
- **Por qué**: es el criterio 12. Los secretos nunca se imprimen (máscaras de Actions) y no se
  guardan en el repositorio.
- **Alternativas**:
  - `appleboy/ssh-action`: se descartó porque es una dependencia de terceros con acceso a la llave.
    El `ssh` del runner basta.
  - Watchtower: se descartó porque no tiene migraciones, prueba de humo ni vuelta atrás.

## R-11. Pruebas E2E con Playwright

- **Decisión**:
  - Ubicación: `tests/e2e/` con `@playwright/test` en la raíz.
  - Proyectos de prueba:
    - `celular`: viewport de 360×740, `isMobile`, `hasTouch`;
    - `escritorio`: 1280×800.
  - En local se usa `channel: 'chrome'` (el Chrome instalado); en CI, el Chromium que instala
    `npx playwright install --with-deps chromium`.
  - Datos:
    - antes de las pruebas, `globalSetup` ejecuta
      `docker compose exec -T api node dist/scripts/sembrar-demostracion.js --salida -`, que deja en
      stdout el JSON con los usuarios (solo con `NODE_ENV` distinto de `production`);
    - el código OTP se lee con `docker compose exec -T redis redis-cli GET <clave>`. Para el personal
      la clave es `dev:otp:<usuarioId>`, el id del JSON de la siembra. Para el administrado es
      `dev:otp:<desafioId>`: el `desafioId` sale de la respuesta de `POST /identidad/verificar`, que
      Playwright intercepta con `page.waitForResponse`. Son las mismas claves que usan las pruebas de
      integración de la 002 y la 004;
    - no hay ningún endpoint para leer códigos (clarificación).
  - Los documentos se adjuntan desde `tests/e2e/apoyo/` (PDF y JPG ficticios).
  - `e2e.yml` corre en cada pull request y en cada push a `main`:
    - `docker compose -f infra/docker-compose.yml up -d --build` con
      `RELOJ_PLAZOS_INTERVALO_MS=0` y la cola de eventos con su intervalo normal;
    - las pruebas;
    - capturas, video y trace como artefacto si fallan.
  - No se agrega a los checks obligatorios (clarificación).
- **Por qué**: es el criterio 6, contra el mismo compose que usa la usuaria, sin servicios
  especiales.
- **Alternativas**:
  - Cypress: se descartó porque Playwright maneja mejor la vista móvil, varios contextos (personal y
    administrado a la vez) y la descarga del PDF.
  - Puppeteer, como en las mediciones de tiempo: no tiene runner, reintentos ni informes.

## R-12. Datos de demostración

- **Decisión**:
  - `apps/api/src/scripts/sembrar-demostracion.ts`, compilado a `dist/scripts/`.
  - Crea un contexto Nest (`NestFactory.createApplicationContext(AppModule)` con los temporizadores
    en 0) y usa los casos de uso y repositorios existentes:
    - un usuario por rol con correo `demo.<rol>@ejemplo.pe`, celular ficticio y una clave de 16
      caracteres de `crypto.randomBytes` en base64url;
    - si el correo ya existe, no lo toca (salvo `--regenerar`, que le pone una clave nueva);
    - 3 expedientes de ejemplo (rutas A, B y C) con titulares ficticios, que se crean solo si no
      existe ninguno con nombre comercial "Demostración".
  - Imprime la tabla de usuarios y claves en la terminal **una sola vez**.
  - `--salida -` imprime JSON para E2E y se rechaza si `NODE_ENV=production`.
  - Nunca escribe las claves en archivos ni en el logger de Nest (usa `process.stdout.write`).
  - En producción: `docker compose exec api-a node dist/scripts/sembrar-demostracion.js`.
- **Por qué**: es FR-039, y E2E necesita usuarios. Es una sola herramienta probada.
- **Alternativas**: un seed SQL con claves fijas. Se descartó porque dejaría claves en el
  repositorio.

## R-13. Mediciones en producción (preparadas)

- **Decisión**:
  - `k6.yml` (`workflow_dispatch`):
    - entradas `base_url`, `escenario` (`eq01-100`, `eq01-1000` o `eq02-picos`) y `replicas` (1 o 2);
    - con `replicas=1`, primero hace `ssh … docker compose stop api-b` y al final lo vuelve a
      levantar, siempre (`if: always()`);
    - ejecuta `grafana/k6:0.54.0` con `--summary-export` y sube el artefacto `k6-<escenario>-<n>`.
  - `eq02-picos.js` usa `stages` de 100 → 500 → 1,000 usuarios, porque 10,000 no son alcanzables
    en 2 GB (supuesto de la especificación).
  - `calidad-produccion.yml` (`workflow_dispatch`):
    - ZAP baseline (`zap-baseline.py -t … -I`) con el informe HTML como artefacto, y falla si hay
      alertas altas o medias;
    - `lhci collect` en modo móvil de `/`, `/asistente`, `/consulta` y `/verificar/<código>`, con
      `assert` de accesibilidad ≥ 0.9;
    - `testssl.sh --protocols --headers`.
  - Los resultados se resumen a mano en `docs/07-despliegue/resultados.md` y en el README.
- **Por qué**: es el criterio 13 y EQ-01, EQ-02, EQ-04 y EQ-05. Se corre desde otra máquina (el
  runner), como pide la entrada.
- **Alternativas**: correr k6 desde la PC de la usuaria. Se descartó porque depende de su conexión.

## R-14. Firewall y puertos

- **Decisión**:
  - El compose de producción solo publica `80:80` y `443:443` (y `443/udp` para HTTP/3) en Caddy.
    Ningún otro servicio tiene `ports:`, solo la red interna.
  - En el servidor, `ufw` permite solo 22, 80 y 443.
  - Docker no esquiva ufw en los puertos que no publica, y en producción no publica ningún otro.
  - La guía agrega el cortafuegos de DigitalOcean como segunda barrera, con los mismos 3 puertos.
  - `verificar-puertos.sh <ip>` se ejecuta desde fuera (WSL o Git Bash con `nc`) y prueba 22, 80,
    443, 3000, 5432, 6379 y 6432, con la salida esperada documentada.
  - `verificar-local.sh` comprueba con `docker compose ps --format` que solo Caddy publica puertos.
- **Por qué**: FR-020 y SC-006.
- **Alternativas**: solo ufw. Se descartó porque Docker puede saltarse ufw en los puertos publicados.
  Por eso se publican únicamente los de Caddy.
