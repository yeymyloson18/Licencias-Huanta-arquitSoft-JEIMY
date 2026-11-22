#!/usr/bin/env sh
# Respaldo diario de la base de datos y de los documentos (007, research §R-09; FR-025).
#   ./respaldo.sh                       (cron del usuario despliegue: 0 3 * * *)
# Deja licencias-AAAAMMDD-HHMM.dump (pg_dump comprimido) y documentos-AAAAMMDD-HHMM.tar.gz en
# $CARPETA_RESPALDOS (700, archivos 600). Escribe primero en .parcial y renombra al terminar; recién
# entonces borra las copias de más de $DIAS_RETENCION días. Una copia fallida no borra las anteriores.
set -eu

CARPETA="$(cd "$(dirname "$0")" && pwd)"
cd "$CARPETA"
ENV_ARCHIVO="${ENV_ARCHIVO:-.env}"
PROYECTO="${COMPOSE_PROJECT_NAME:-licencias}"
CARPETA_RESPALDOS="${CARPETA_RESPALDOS:-$HOME/respaldos}"
DIAS_RETENCION="${DIAS_RETENCION:-7}"
SELLO="$(date +%Y%m%d-%H%M)"

registrar() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
dc() { docker compose -p "$PROYECTO" --env-file "$ENV_ARCHIVO" "$@"; }
leer_variable() { sed -n "s/^$1=//p" "$ENV_ARCHIVO" | tail -n 1; }

umask 077
mkdir -p "$CARPETA_RESPALDOS"
chmod 700 "$CARPETA_RESPALDOS"

DUMP="$CARPETA_RESPALDOS/licencias-$SELLO.dump"
DOCS="$CARPETA_RESPALDOS/documentos-$SELLO.tar.gz"
USUARIO="$(leer_variable POSTGRES_USER)"
BASE="$(leer_variable POSTGRES_DB)"

registrar "respaldando la base de datos"
dc exec -T postgres pg_dump -U "$USUARIO" -d "$BASE" -Fc > "$DUMP.parcial"
mv "$DUMP.parcial" "$DUMP"

registrar "respaldando los documentos"
VOLUMEN="${PROYECTO}_archivos-tramites"
docker run --rm -v "$VOLUMEN:/datos:ro" alpine:3.20 tar czf - -C /datos . > "$DOCS.parcial"
mv "$DOCS.parcial" "$DOCS"

chmod 600 "$DUMP" "$DOCS"
registrar "copias listas: $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1)), $(basename "$DOCS") ($(du -h "$DOCS" | cut -f1))"

# Solo después de un respaldo completo: quitar las copias viejas (y restos .parcial de fallos previos).
find "$CARPETA_RESPALDOS" -maxdepth 1 -type f \( -name 'licencias-*.dump' -o -name 'documentos-*.tar.gz' -o -name '*.parcial' \) \
  -mtime +"$DIAS_RETENCION" -exec rm -f {} +
registrar "retención aplicada: se conservan $DIAS_RETENCION días"
