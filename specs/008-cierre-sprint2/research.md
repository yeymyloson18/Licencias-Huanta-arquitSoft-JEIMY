# Investigación: Cierre del Sprint 2 (008)

## R-01. Swagger UI servido por la API

- **Decisión**:
  - `swagger-ui-dist` 5.17.14 (solo archivos estáticos) servido con `express.static` en `/api/docs`.
  - Un `index.html` propio y un `inicializador.js` propio, sin código en línea, que cargan
    `/api/docs/openapi.json`.
  - El contrato se lee **una vez al arrancar** desde `DOCS_API_CONTRATO`. Por defecto la ruta es
    `../../docs/06-contrato-api/openapi.yaml` relativa a `apps/api`, o `contrato/openapi.yaml` dentro de
    la imagen. Se convierte con `yaml` y se sirve como JSON con `Cache-Control: no-cache`.
  - Swagger tiene "Authorize" con el esquema `bearerPersonal` del contrato, así que se pega el token
    del personal. `persistAuthorization: false`: el token no se guarda en `localStorage`.
  - Las peticiones "Try it out" van al mismo origen: el contrato agrega como **primer** servidor el
    relativo `/api/v1` ("Mismo origen: portal o API"). Sin él, Swagger usaría
    `http://localhost:3000/api/v1`, otro origen desde el portal (8080), y la CSP (`connect-src
    'self'`) lo bloquearía (hallazgo H1 del análisis).
  - `validatorUrl: null`: Swagger UI no consulta el validador externo `validator.swagger.io` (FR-005,
    hallazgo H2).
- **Por qué**: hay una sola fuente de verdad, no hay decoradores que dupliquen el contrato y no se
  carga nada de terceros (FR-001 y FR-005). `swagger-ui-express` agrega una dependencia más y genera
  HTML con script en línea, lo que obligaría a abrir `script-src`.
- **Alternativas**: `@nestjs/swagger`, que genera desde decoradores; se descartó porque duplicaría el
  contrato. Redoc es solo lectura y no permite probar.

## R-02. ¿Se documenta `/api/docs` en el contrato?

- **Decisión**: no. Las rutas de la documentación no son parte de la API de negocio y quedan fuera de
  `/api/v1`. Se describen en el README del contrato y en `contracts/documentacion-api.md`.
- **Único cambio del contrato**: agregar el servidor relativo `/api/v1` como primero de `servers`
  (R-01). No cambia rutas, esquemas ni respuestas: solo documenta dónde se prueba la API.
- **Por qué**: el contrato describe la API que consume el portal. Meter la documentación dentro de sí
  misma no aporta. La entrada dice "salvo para documentar /api/docs si corresponde", y no corresponde.

## R-03. Política de contenido solo para la documentación

- **Decisión**: Swagger UI necesita estilos en línea (atributos `style`) e imágenes `data:`. La CSP de
  `/api/docs` es:

  ```text
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
  connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'
  ```

  - La pone la propia API para esas rutas y nginx la respeta en `location /api/docs`, con el snippet
    nuevo `cabeceras-docs.conf`: las mismas cabeceras, salvo la CSP.
  - En producción, `handle /api/docs*` del `Caddyfile` hace lo mismo, aunque allí la documentación está
    apagada por defecto.
  - Una prueba lee `nginx.conf`, `cabeceras-seguridad.conf` y el `Caddyfile` y comprueba lo siguiente:
    - la CSP estricta sigue igual en las demás ubicaciones;
    - solo `/api/docs` tiene la ajustada.
- **Por qué**: FR-004 y SC-003. No se debilita el resto del portal.

## R-04. Configuración `DOCS_API`

- **Decisión**:
  - `DOCS_API` con los valores `true` o `false`. Por defecto `true`, salvo con `NODE_ENV=production`,
    donde es `false` (aclaración).
  - Apagada, ni `/api/docs` ni `/api/docs/openapi.json` se montan y responden 404.
  - Si `DOCS_API=true` y el contrato no se puede leer, la API no arranca y lo explica en el mensaje de
    error de configuración.
  - El compose de producción no la define, así que queda apagada.

## R-05. Postman y Newman

- **Decisión**:
  - **Colección completa**: `npx openapi-to-postmanv2@4.20.1 -s docs/06-contrato-api/openapi.yaml -o
    tests/postman/licencias-huanta.postman_collection.json -p -O folderStrategy=Tags`. Se regenera con
    `npm run postman:generar`.
  - **Colección de humo** (escrita a mano, versión 2.1):
    - públicas: `GET /salud`, `GET /catalogo/recetas`, `GET /catalogo/recetas/LIC-02`,
      `GET /asistente/preguntas` y `POST /asistente/proponer`;
    - protegidas sin token, que deben dar 401: `GET /expedientes`, `GET /reportes/tablero`,
      `GET /usuarios` y `GET /feriados`;
    - con un token de CAJA, que deben dar 403: `GET /reportes/tablero`, `GET /usuarios` y
      `POST /feriados`;
    - con el token de JEFATURA, que debe dar 200: `GET /reportes/tablero`.
  - **Entorno** `desarrollo.postman_environment.json`: `baseUrl` y `tokenCaja` y `tokenJefatura`
    **vacíos**.
  - `preparar-entorno.mjs`, en el ejecutor:
    1. ejecuta `sembrar-demostracion --regenerar --salida -`;
    2. ingresa con CAJA y JEFATURA (clave y OTP leído de Redis con `docker compose exec`);
    3. escribe un entorno temporal fuera del repositorio.
  - `postman.yml` se dispara en `pull_request` y `workflow_dispatch`: compose de desarrollo, entorno,
    `npx newman@6 run … -r cli,htmlextra` e informe como artefacto.
- **Por qué**: FR-007 a FR-009. Sin secretos en el repositorio.

## R-06. Carga progresiva hasta 2,000 usuarios en GitHub Actions

- **Decisión**:
  - `docker compose -f infra/docker-compose.yml -f tests/carga/compose-carga.yml up -d --build --wait
    --scale api=2`. El archivo de ajustes hace tres cosas:
    - quita el puerto publicado de la API (`ports: !reset []`), para que no choque al escalar;
    - pone `TRUST_PROXY_SALTOS=2`, para que cada usuario virtual simule su origen con
      `X-Forwarded-For` y no se mida el límite de intentos;
    - pone `RELOJ_PLAZOS_INTERVALO_MS=0`.
  - nginx (`web`) resuelve `api` a las dos réplicas y las alterna.
  - k6 (`grafana/k6:0.54.0`, red del host) apunta a `http://localhost:8080/api/v1`.
  - `sprint2-progresivo.js`:
    - etapas: 1 min hasta 100, 1 min de meseta, 1 min hasta 500, 1 min hasta 1,000, 1 min hasta 1,500,
      1 min hasta 2,000, 3 min de meseta en 2,000 y 1 min de bajada;
    - mezcla: 35 % lista del catálogo, 25 % ficha, 15 % preguntas y propuesta del asistente, 25 %
      consulta del estado con pares `numero:documento` de los expedientes sembrados;
    - pausas de 1 a 3 s;
    - umbrales: `p(95)<2000` y `rate<0.01`, también por etiqueta de etapa.
  - **Etapas**: se etiquetan con `exec.scenario` y el tiempo transcurrido. El resumen por etapa sale
    del JSON de salida (`--out json`) procesado con un script `jq` que agrupa por minuto y número de
    usuarios.
  - **Resultado verde aunque se superen los umbrales** (aclaración): se usa `k6 run … || true`, y un
    paso posterior escribe en el resumen del job "umbral superado" con la etapa. El job falla solo si
    el compose no arranca o k6 no produce resumen.
  - **Recursos**: `medir-recursos.sh` corre en segundo plano y cada 10 s guarda:
    - `docker stats --no-stream --format '{{json .}}'`;
    - `redis-cli INFO stats` (`keyspace_hits` y `keyspace_misses`);
    - `pg_stat_activity` (conexiones por estado);
    - `pg_stat_database` (`blks_hit` y `blks_read`).
  - **Caché**: `cache-comparacion.js` (50 usuarios, 1 min, solo catálogo) se ejecuta dos veces, con
    Redis y después de `docker compose stop redis`. Se comparan los p50 y p95.
  - Artefactos: `resumen.json`, `informe.html` (con `K6_WEB_DASHBOARD_EXPORT`), `recursos.jsonl` y
    `cache-con.json` y `cache-sin.json`.
- **Por qué**: FR-012 a FR-015 y las aclaraciones. El ejecutor (4 vCPU y 16 GB en repositorios
  públicos; 2 vCPU y 7 GB en privados) comparte el procesador entre k6 y el sistema. Se documenta.
- **Alternativas**: k6 Cloud, que es de pago y saca los datos fuera; o correr contra el servidor, que
  es del Sprint 3.

## R-07. Planes de consulta con 10,000 expedientes

- **Decisión**:
  - Job `planes-bd`: servicio `postgres:16-alpine`, `npm ci`, `prisma migrate deploy` y después
    `psql`.
  - `sembrar-10000.sql` usa `generate_series` y crea:
    - 10,000 expedientes ficticios en estados repartidos y fechas de los últimos 12 meses;
    - el historial (REGISTRADO y una decisión);
    - 6,000 esquelas, 4,000 de ellas pagadas;
    - 2,000 eventos pendientes.

    Los documentos van en `bytea` ficticio y los HMAC son `sha256` del número. No hay datos reales.
  - Luego `ANALYZE`.
  - `planes-consultas.sql`: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` de las mismas consultas que
    ejecuta el código (copiadas de los repositorios y citadas por archivo):
    1. bandeja (estado + evaluador, ordenada por presentación);
    2. consulta pública por número + `documento_hmac`;
    3. tablero (conteo por estado en un rango y primera decisión final);
    4. esquela por código;
    5. toma de eventos con `FOR UPDATE SKIP LOCKED`;
    6. reloj de plazos (vencimientos próximos).
  - Salida a `planes.txt` como artefacto. Su contenido se copia a `base-de-datos.md`.
- **Por qué**: FR-016 y FR-017. Es reproducible y no pesa en local.

## R-08. Cobertura publicada

- **Decisión**:
  - API: `coverageReporters: ['text', 'lcov', 'json-summary']` (lcov ya incluye el HTML en
    `coverage/lcov-report`).
  - Portal: script `cobertura` (`jest --coverage`) con los mismos reportes y sin umbral (aclaración).
  - En `ci.yml`, el job `cobertura` (mismo nombre) agrega `npm run cobertura -w apps/web` y
    `actions/upload-artifact` con `apps/api/coverage` y `apps/web/coverage`.
  - `resumen-cobertura.mjs` lee `coverage-summary.json` y agrupa por módulo y capa (líneas y ramas)
    en una tabla Markdown. Se ejecuta en local, porque las pruebas unitarias son livianas, y se pega
    en el README y en el informe.

## R-09. Documentos del Sprint 2

- **Decisión**:
  - Se escriben a partir del código (citando archivo y frase, sin números de línea) y de los
    resultados ya registrados en los README de las funcionalidades 003 a 007.
  - Las cifras que salen de los flujos nuevos (2,000 usuarios, Newman, planes con 10,000 expedientes)
    quedan con "pendiente: ejecutar `carga-sprint2.yml`" y la tabla lista para completar.
  - Los estados de `atributos-de-calidad.md` solo dicen "cumple" con una evidencia ya existente.
