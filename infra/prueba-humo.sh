#!/usr/bin/env bash
# Prueba de humo de la historia 1 (FR-001, FR-004): levanta el sistema con el comando único,
# espera a que los 4 servicios estén sanos, consulta la API y el portal, y comprueba que volver a
# levantar sobre datos existentes no falla ni duplica los datos semilla.
# Uso (desde la raíz del repositorio): bash infra/prueba-humo.sh
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f infra/docker-compose.yml)

# Si existe infra/.env (puertos cambiados), se usan los mismos valores que lee Docker Compose.
if [[ -f infra/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source infra/.env
  set +a
fi
PUERTO_API="${PUERTO_API:-3000}"
PUERTO_WEB="${PUERTO_WEB:-8080}"
POSTGRES_USER="${POSTGRES_USER:-licencias}"
POSTGRES_DB="${POSTGRES_DB:-licencias}"
SERVICIOS=4
ESPERA_MAXIMA=180

paso() { printf '\n== %s\n' "$*"; }
fallar() {
  printf '\nFALLA: %s\n' "$*" >&2
  "${COMPOSE[@]}" ps >&2 || true
  exit 1
}

levantar() {
  paso "Levantando el sistema con el comando único"
  "${COMPOSE[@]}" up -d --build
}

esperar_servicios_sanos() {
  paso "Esperando hasta ${ESPERA_MAXIMA} s a que los ${SERVICIOS} servicios estén healthy"
  local inicio=$SECONDS sanos=0
  while (( SECONDS - inicio < ESPERA_MAXIMA )); do
    sanos=$("${COMPOSE[@]}" ps --format json | grep -o '"Health":"healthy"' | wc -l | tr -d ' ')
    if (( sanos == SERVICIOS )); then
      echo "Servicios healthy: ${sanos}/${SERVICIOS} ($(( SECONDS - inicio )) s)"
      return 0
    fi
    sleep 3
  done
  fallar "solo ${sanos}/${SERVICIOS} servicios healthy tras ${ESPERA_MAXIMA} s"
}

comprobar_api_y_portal() {
  paso "Consultando la API y el portal"
  local salud
  salud=$(curl -fsS "http://localhost:${PUERTO_API}/api/v1/salud") || fallar "la API no responde"
  echo "Salud: ${salud}"
  [[ "$salud" == *'"estado":"OK"'* ]] || fallar "el chequeo de salud no informa OK"

  local codigo
  codigo=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PUERTO_WEB}/")
  echo "Portal: HTTP ${codigo}"
  [[ "$codigo" == "200" ]] || fallar "el portal respondió HTTP ${codigo}"
}

contar() {
  "${COMPOSE[@]}" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM $1"
}

comprobar_datos_semilla() {
  paso "Comprobando que los datos semilla no se duplicaron"
  local recetas roles
  recetas=$(contar catalogo.receta | tr -d '[:space:]')
  roles=$(contar seguridad.rol | tr -d '[:space:]')
  echo "Recetas: ${recetas} (esperadas 12) · Roles: ${roles} (esperados 6)"
  [[ "$recetas" == "12" ]] || fallar "hay ${recetas} recetas en lugar de 12"
  [[ "$roles" == "6" ]] || fallar "hay ${roles} roles en lugar de 6"
}

levantar
esperar_servicios_sanos
comprobar_api_y_portal

paso "Deteniendo (sin borrar datos) y volviendo a levantar sobre los datos existentes"
"${COMPOSE[@]}" down
levantar
esperar_servicios_sanos
comprobar_api_y_portal
comprobar_datos_semilla

printf '\nOK: prueba de humo superada\n'
