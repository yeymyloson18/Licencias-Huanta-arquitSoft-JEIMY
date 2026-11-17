Plan técnico de la funcionalidad 001. Respeta la constitución y usa este stack:



\- Monorepo con npm workspaces: apps/api, apps/web, packages/contracts.

\- apps/api: NestJS con TypeScript estricto. Módulos en apps/api/src/modulos/<modulo>/ con las capas dominio, aplicacion, infraestructura y presentacion (nombres en español, como dice la constitución).

\- Base de datos: PostgreSQL 16 con Prisma (multiSchema). La migración inicial usa docs/05-modelo-de-datos/esquema.sql y una segunda migración carga datos-semilla.sql.

\- Caché: Redis 7 con ioredis. El catálogo usa cache-aside con TTL de 300 segundos.

\- Chequeo de salud: GET /api/v1/salud con timeout de 2 segundos por dependencia.

\- apps/web: React + Vite + TypeScript, primero celular, con la página de inicio del catálogo.

\- packages/contracts: tipos generados con openapi-typescript desde docs/06-contrato-api/openapi.yaml.

\- infra/docker-compose.yml: postgres, redis, api y web, con healthchecks. Un solo comando: docker compose -f infra/docker-compose.yml up -d --build.

\- Calidad: ESLint, Prettier, Jest + Supertest, cobertura con umbral de 80 % en dominio y aplicacion, dependency-cruiser con la regla de Clean Architecture y de aislamiento entre módulos, y validación del contrato con @redocly/cli lint.

\- CI: .github/workflows/ci.yml con las 5 verificaciones en cada pull request.

\- Variables en .env.example, sin secretos reales.



Correcciones que incluye este plan:

1\. Antes de programar, actualizar en docs/06-contrato-api/openapi.yaml la descripción del 503 de /salud: "La base de datos no responde". Si solo falla la caché, responde 200 con estado DEGRADADO.

2\. La protección de main (FR-019a) se activa como última tarea, después de que el CI haya corrido en verde al menos una vez, y se documenta en el README.

