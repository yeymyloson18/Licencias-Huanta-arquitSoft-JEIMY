# syntax=docker/dockerfile:1
# Imagen del backend NestJS. Contexto de build: raíz del repositorio (monorepo con npm workspaces).

# ---- Base: Node 24 LTS + openssl (lo necesita el motor de Prisma en Alpine) ----
FROM node:24-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app
# npm ci valida el lockfile contra todos los workspaces, por eso se copian sus package.json.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/

# ---- Dependencias completas (para compilar) ----
FROM base AS dependencias
RUN npm ci -w apps/api -w packages/contracts --include-workspace-root --no-audit --no-fund

# ---- Build: tipos del contrato, cliente Prisma y compilación de NestJS ----
FROM dependencias AS build
COPY tsconfig.base.json ./
COPY docs/06-contrato-api/openapi.yaml docs/06-contrato-api/
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run generar && npm run build -w apps/api

# ---- Dependencias de producción (incluye el CLI de Prisma para migrate deploy) ----
FROM base AS dependencias-produccion
# npm puede dejar paquetes anidados en el workspace (conflicto de versiones); la carpeta se crea
# siempre para que la etapa final la pueda copiar aunque esté vacía.
RUN npm ci -w apps/api --omit=dev --no-audit --no-fund && mkdir -p apps/api/node_modules

# ---- Imagen final ----
FROM node:24-alpine AS final
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    PATH=/app/node_modules/.bin:$PATH
WORKDIR /app/apps/api
COPY --from=dependencias-produccion --chown=node:node /app/node_modules /app/node_modules
COPY --from=dependencias-produccion --chown=node:node /app/apps/api/node_modules /app/apps/api/node_modules
# Cliente Prisma generado en la etapa de build (no lo genera `npm ci --omit=dev`).
COPY --from=build --chown=node:node /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --chown=node:node apps/api/prisma ./prisma
# Contrato para la documentación interactiva /api/docs (008): una sola fuente de verdad.
COPY --chown=node:node docs/06-contrato-api/openapi.yaml ./contrato/openapi.yaml
# package.json: la configuración toma de aquí la versión del servicio.
COPY --chown=node:node apps/api/package.json ./
# Carpeta del almacén de documentos (004): el volumen con nombre copia su dueño la primera vez, así
# la API puede escribir sin ser root.
RUN mkdir -p /var/lib/licencias/archivos && chown node:node /var/lib/licencias/archivos
USER node
EXPOSE 3000
# Aplica las migraciones pendientes (cada una una sola vez, FR-004) y arranca la API.
CMD ["sh", "-c", "prisma migrate deploy --schema prisma/schema.prisma && node dist/main.js"]
