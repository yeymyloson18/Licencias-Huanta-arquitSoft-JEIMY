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
# 008: el portal de producción se compila sin el enlace a /api/docs (cd.yml pasa DOCS_API=false).
ARG DOCS_API=true
ENV VITE_DOCS_API=$DOCS_API
RUN npm run generar && npm run build -w apps/web

# ---- Producción (007): Caddy sirve el portal y es el punto de entrada con HTTPS ----
# Se construye con `--target produccion` (flujo cd.yml). La etapa por defecto sigue siendo nginx.
FROM caddy:2.8-alpine AS produccion
COPY infra/produccion/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80 443 443/udp

# ---- Imagen final (desarrollo y CI) ----
FROM nginx:1-alpine AS final
COPY apps/web/nginx-principal.conf /etc/nginx/nginx.conf
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/cabeceras-seguridad.conf /etc/nginx/snippets/cabeceras-seguridad.conf
COPY apps/web/cabeceras-docs.conf /etc/nginx/snippets/cabeceras-docs.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
