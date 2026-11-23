#!/usr/bin/env sh
# Restauración de un respaldo (007, research §R-09; FR-026; docs/07-despliegue/respaldo-restauracion.md).
#   ./restaurar.sh <licencias-AAAAMMDD-HHMM.dump>
#       Restaura en una base APARTE (licencias_restaurada) y compara los conteos con la base viva.
#   ./restaurar.sh <dump> --reemplazar [--documentos <documentos-...tar.gz>]
#       Restaura SOBRE la base real (pide escribir RESTAURAR). Detenga antes api-a y api-b.
# Sale con 0 si todos los conteos coinciden (o si la restauración real terminó bien).
set -eu

CARPETA="$(cd "$(dirname "$0")" && pwd)"
cd "$CARPETA"
ENV_ARCHIVO="${ENV_ARCHIVO:-.env}"
PROYECTO="${COMPOSE_PROJECT_NAME:-licencias}"
DUMP="${1:?Uso: ./restaurar.sh <archivo.dump> [--reemplazar] [--documentos <archivo.tar.gz>]}"
shift
REEMPLAZAR=0
DOCUMENTOS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --reemplazar) REEMPLAZAR=1 ;;
    --documentos) DOCUMENTOS="${2:?Falta el archivo de documentos}"; shift ;;
    *) printf 'Opción desconocida: %s\n' "$1" >&2; exit 64 ;;
  esac
  shift
done

dc() { docker compose -p "$PROYECTO" --env-file "$ENV_ARCHIVO" "$@"; }
leer_variable() { sed -n "s/^$1=//p" "$ENV_ARCHIVO" | tail -n 1; }
USUARIO="$(leer_variable POSTGRES_USER)"
BASE="$(leer_variable POSTGRES_DB)"
psql_en() { dc exec -T postgres psql -U "$USUARIO" -d "$1" -v ON_ERROR_STOP=1 -tAc "$2"; }

if [ "$REEMPLAZAR" = "1" ]; then
  printf 'Esto reemplaza la base %s con %s. Escriba RESTAURAR para seguir: ' "$BASE" "$(basename "$DUMP")"
  read -r respuesta
  [ "$respuesta" = "RESTAURAR" ] || { echo 'Cancelado.'; exit 1; }
  dc exec -T postgres pg_restore -U "$USUARIO" -d "$BASE" --clean --if-exists --no-owner < "$DUMP"
  if [ -n "$DOCUMENTOS" ]; then
    docker run --rm -i -v "${PROYECTO}_archivos-tramites:/datos" alpine:3.20 \
      sh -c 'rm -rf /datos/* && tar xzf - -C /datos' < "$DOCUMENTOS"
  fi
  echo 'Restauración completa. Levante de nuevo api-a y api-b.'
  exit 0
fi

PRUEBA=licencias_restaurada
psql_en "$BASE" "DROP DATABASE IF EXISTS $PRUEBA" > /dev/null
psql_en "$BASE" "CREATE DATABASE $PRUEBA" > /dev/null
dc exec -T postgres pg_restore -U "$USUARIO" -d "$PRUEBA" --no-owner < "$DUMP"

CONSULTAS="expedientes|SELECT count(*) FROM tramites.expediente
pagos registrados|SELECT count(*) FROM pagos.esquela WHERE pagada_en IS NOT NULL
licencias|SELECT count(*) FROM licencias.licencia
auditoría de trámites|SELECT count(*) FROM tramites.auditoria
auditoría de pagos|SELECT count(*) FROM pagos.auditoria
historial de estados|SELECT count(*) FROM tramites.historial_estado"

todo_ok=0
printf '%-24s %8s %11s %4s\n' 'tabla' 'viva' 'restaurada' 'ok'
printf '%s\n' "$CONSULTAS" | while IFS='|' read -r nombre consulta; do
  viva="$(psql_en "$BASE" "$consulta")"
  restaurada="$(psql_en "$PRUEBA" "$consulta")"
  marca=no
  [ "$viva" = "$restaurada" ] && marca=si
  printf '%-24s %8s %11s %4s\n' "$nombre" "$viva" "$restaurada" "$marca"
done | tee /tmp/restauracion.$$
grep -q ' no$' /tmp/restauracion.$$ && todo_ok=1
rm -f /tmp/restauracion.$$
psql_en "$BASE" "DROP DATABASE IF EXISTS $PRUEBA" > /dev/null
exit "$todo_ok"
