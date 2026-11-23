#!/usr/bin/env sh
# Despliegue sin cortes con vuelta atrás (007, research §R-06; contracts/produccion.md).
#   ./desplegar.sh sha-abc1234
# Pasos: guarda la versión actual, baja las imágenes nuevas, aplica las migraciones con la conexión
# directa, actualiza api-a y luego api-b esperando a que cada una esté sana (Caddy deja de enviar
# tráfico a la que se reinicia), actualiza Caddy y hace la prueba de humo. Si la prueba falla, vuelve
# a la versión anterior.
# Códigos: 0 versión nueva sana · 1 humo falló y se volvió atrás · 2 fallaron las migraciones (no se
# tocó nada) · 3 falló también la vuelta atrás (hay que revisar a mano).
# Nunca imprime secretos ni datos personales.
set -eu

CARPETA="$(cd "$(dirname "$0")" && pwd)"
cd "$CARPETA"
NUEVA="${1:?Uso: ./desplegar.sh <version>}"
ENV_ARCHIVO="${ENV_ARCHIVO:-.env}"
PROYECTO="${COMPOSE_PROJECT_NAME:-licencias}"
URL_SALUD="${URL_SALUD:-}"
ESPERA_SANA_S="${ESPERA_SANA_S:-120}"

registrar() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

dc() { docker compose -p "$PROYECTO" --env-file "$ENV_ARCHIVO" "$@"; }

leer_variable() { sed -n "s/^$1=//p" "$ENV_ARCHIVO" | tail -n 1; }

fijar_version() {
  if grep -q '^VERSION=' "$ENV_ARCHIVO"; then
    sed -i "s/^VERSION=.*/VERSION=$1/" "$ENV_ARCHIVO"
  else
    printf 'VERSION=%s\n' "$1" >> "$ENV_ARCHIVO"
  fi
}

esperar_sana() {
  servicio="$1"
  limite=$(( $(date +%s) + ESPERA_SANA_S ))
  while [ "$(date +%s)" -lt "$limite" ]; do
    id="$(dc ps -q "$servicio")"
    if [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null)" = "healthy" ]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

actualizar() {
  for servicio in api-a api-b; do
    registrar "actualizando $servicio"
    dc up -d --no-deps "$servicio"
    esperar_sana "$servicio" || return 1
    registrar "$servicio sana"
  done
  dc up -d --no-deps caddy
  esperar_sana caddy
}

humo() {
  dominio="$(leer_variable DOMINIO)"
  url="${URL_SALUD:-https://$dominio/api/v1/salud}"
  intento=1
  while [ "$intento" -le 10 ]; do
    if curl -fsS --max-time 5 ${CURL_INSEGURO:+-k} "$url" > /dev/null 2>&1; then
      return 0
    fi
    intento=$((intento + 1))
    sleep 3
  done
  return 1
}

ANTERIOR="$(leer_variable VERSION)"
printf '%s\n' "$ANTERIOR" > .version-anterior
registrar "versión actual: ${ANTERIOR:-ninguna}; nueva: $NUEVA"

fijar_version "$NUEVA"
if [ "${SIN_PULL:-}" != "1" ]; then
  dc pull api-a api-b caddy
fi

registrar "aplicando migraciones"
if ! dc --profile migrar run --rm migrar; then
  fijar_version "$ANTERIOR"
  registrar "ERROR: fallaron las migraciones; no se tocó ninguna réplica"
  exit 2
fi

if actualizar && humo; then
  registrar "OK: $NUEVA desplegada y sana"
  exit 0
fi

registrar "ERROR: la versión $NUEVA no pasó la prueba de humo; volviendo a $ANTERIOR"
if [ -z "$ANTERIOR" ]; then
  registrar "ERROR: no hay versión anterior a la cual volver"
  exit 3
fi
fijar_version "$ANTERIOR"
if actualizar && humo; then
  registrar "vuelta atrás completa: $ANTERIOR sana"
  exit 1
fi
registrar "ERROR: también falló la vuelta atrás; revise 'docker compose ps' y los registros"
exit 3
