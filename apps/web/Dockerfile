# syntax=docker/dockerfile:1
# Imagen del portal web: build de Vite servido por nginx. Contexto de build: raíz del repositorio.

# ---- Build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
# --include-workspace-root: TypeScript (tsc --noEmit del build) está en la raíz.
RUN npm ci -w apps/web -w packages/contracts --include-workspace-root --no-audit --no-fund
COPY tsconfig.base.json ./
COPY docs/06-contrato-api/openapi.yaml docs/06-contrato-api/
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run generar && npm run build -w apps/web

# ---- Imagen final ----
FROM nginx:1-alpine AS final
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/cabeceras-seguridad.conf /etc/nginx/snippets/cabeceras-seguridad.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
