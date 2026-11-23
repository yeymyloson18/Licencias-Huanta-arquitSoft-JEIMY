#!/usr/bin/env sh
# Regla "agregar antes de quitar" (007, FR-035): la vuelta atrás del despliegue solo cambia las
# imágenes, así que una migración nueva no puede romper la versión anterior del servicio.
#   infra/produccion/revisar-migraciones.sh [rama-base]      (por defecto origin/main, o main)
# Sale con 1 si una migración nueva respecto de la rama base borra o renombra tablas o columnas, o
# cambia el tipo de una columna, sin el comentario `-- compatible: <motivo>` en el mismo archivo.
set -eu

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"
BASE="${1:-}"
if [ -z "$BASE" ]; then
  if git rev-parse --verify -q origin/main > /dev/null; then BASE=origin/main; else BASE=main; fi
fi

CARPETA=apps/api/prisma/migrations
nuevas="$(git diff --name-only --diff-filter=A "$BASE"...HEAD -- "$CARPETA" | grep 'migration\.sql$' || true)"
# También las migraciones aún sin confirmar (para revisarlas antes del commit).
sin_confirmar="$(git ls-files --others --exclude-standard -- "$CARPETA" | grep 'migration\.sql$' || true)"

fallas=0
for archivo in $nuevas $sin_confirmar; do
  [ -f "$archivo" ] || continue
  # Sin comentarios: se buscan sentencias que rompen la versión anterior.
  peligrosas="$(sed 's/--.*$//' "$archivo" | grep -inE 'drop[[:space:]]+(table|column)|rename[[:space:]]+(to|column)|alter[[:space:]]+column[^;]*type' || true)"
  if [ -n "$peligrosas" ] && ! grep -qE '^[[:space:]]*--[[:space:]]*compatible:' "$archivo"; then
    echo "ERROR: $archivo borra, renombra o cambia el tipo de algo sin '-- compatible: <motivo>':"
    printf '%s\n' "$peligrosas" | sed 's/^/    /'
    fallas=1
  fi
done

if [ "$fallas" -eq 0 ]; then
  echo "OK: las migraciones nuevas son compatibles con la versión anterior (agregar antes de quitar)."
fi
exit "$fallas"
