# Guía de validación: Esqueleto del sistema

Escenarios ejecutables que demuestran que la funcionalidad 001 funciona de punta a punta. Los
detalles de cada interfaz están en [contracts/](./contracts/) y las entidades en
[data-model.md](./data-model.md).

## Requisitos previos

- Git, Docker Desktop (o Docker Engine) con Compose v2, Node.js 24 LTS con npm (solo para pruebas
  locales).
- Puertos libres por defecto: 8080 (portal), 3000 (API), 5432 (PostgreSQL), 6379 (Redis). Si alguno
  está ocupado: `cp .env.example infra/.env` y cambiar `PUERTO_*`.

## 1. Levantar todo con un comando (Historia 1, FR-001, SC-001)

```bash
git clone <repositorio> && cd licencias-huanta
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml ps
```

**Esperado**: los 4 servicios (`postgres`, `redis`, `api`, `web`) en estado `healthy`, sin crear
archivos ni pedir secretos.

## 2. Chequeo de salud (Historia 2, EQ-03, SC-003, SC-004)

```bash
curl -i http://localhost:3000/api/v1/salud
docker compose -f infra/docker-compose.yml stop redis
curl -i http://localhost:3000/api/v1/salud
docker compose -f infra/docker-compose.yml start redis   # esperar unos segundos
curl -i http://localhost:3000/api/v1/salud
docker compose -f infra/docker-compose.yml stop postgres
time curl -i http://localhost:3000/api/v1/salud
docker compose -f infra/docker-compose.yml start postgres
```

**Esperado** (ver [contracts/salud.md](./contracts/salud.md)): `200 OK` → `200 DEGRADADO`
(`cache: CAIDO`) → `200 OK` sin reiniciar la API → `503 CAIDO` (`baseDeDatos: CAIDO`) en menos de
3 s → `200 OK` al volver la base. Ninguna respuesta muestra datos de conexión.

> Nota: con la base detenida, el healthcheck de Docker marcará `api` como `unhealthy`; es lo
> esperado (el balanceador haría lo mismo).

## 3. Catálogo en el portal (Historia 3, SC-005, SC-006)

```bash
curl -s "http://localhost:3000/api/v1/catalogo/recetas?tipo=LICENCIA"
curl -i "http://localhost:3000/api/v1/catalogo/recetas?tipo=OTRO"
```

**Esperado**: 9 elementos LIC-01 a LIC-09 con las tasas de `datos-semilla.sql` y cabecera
`Cache-Control: public, max-age=300`; el segundo responde `422` en `problem+json`.

Abrir http://localhost:8080 con las herramientas de desarrollo en modo celular (360 px):

- Se ven las 9 licencias con nombre, tasa en soles y plazo, sin desplazamiento horizontal.
- Lighthouse (modo móvil): accesibilidad ≥ 90 y buenas prácticas ≥ 90.
- `docker compose -f infra/docker-compose.yml stop api` y recargar: aparece el mensaje "El catálogo
  no está disponible…" (no una página en blanco). Volver a iniciar `api`.

## 4. Cambio de tasa sin tocar código (EQ-06, SC-008)

```bash
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U licencias -d licencias -c "UPDATE catalogo.receta SET tasa = 160.00 WHERE codigo = 'LIC-01';"
```

**Esperado**: tras 5 minutos como máximo (TTL de caché), al recargar el portal LIC-01 muestra
`S/ 160.00`. Revertir con `tasa = 159.50`.

## 5. Reinicio sin duplicar datos (FR-004)

```bash
docker compose -f infra/docker-compose.yml down
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U licencias -d licencias -c "SELECT count(*) FROM catalogo.receta;"
```

**Esperado**: arranca sin errores; el conteo sigue siendo 12 (9 licencias + 3 trámites conectados).

## 6. Calidad local (Historia 4)

```bash
npm ci
npm run build          # compilación estricta de los 3 workspaces
npm test               # pruebas (requiere postgres y redis del compose)
npm run cobertura      # umbral 80 % en dominio y aplicacion
npm run regla-dependencia
npm run contrato       # redocly lint
```

**Esperado**: todo en verde. Prueba negativa de la regla de dependencia: agregar en
`apps/api/src/modulos/catalogo/dominio/` un `import '@nestjs/common'` o un import a
`../../tramites/dominio/...`; `npm run regla-dependencia` falla indicando archivo y regla. Revertir.

## 7. Estructura de módulos (FR-017, SC-009)

```bash
ls apps/api/src/modulos
ls apps/api/src/modulos/*/
```

**Esperado**: `catalogo inspecciones licencias notificaciones pagos plazos reportes seguridad
tramites`, cada uno con `aplicacion dominio infraestructura presentacion`.

## 8. Sin secretos (FR-003, SC-002)

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo --no-banner
```

**Esperado**: 0 hallazgos.

## 9. CI y protección de `main` (FR-019, FR-019a, SC-007)

1. Abrir un PR: se ejecutan los 5 checks de [contracts/ci-verificaciones.md](./contracts/ci-verificaciones.md) y terminan en verde.
2. PR de prueba con una importación prohibida o un `openapi.yaml` inválido: el check
   correspondiente falla y el PR no se puede fusionar.
3. Tras activar la protección (última tarea): `git push origin main` directo es rechazado.
