#!/usr/bin/env sh
# Muestras de recursos durante la carga del Sprint 2 (008, research §R-06). Cada 10 s escribe líneas
# JSON en <salida.jsonl> hasta que se borra el archivo <bandera>:
#   - contenedores: CPU y memoria (docker stats);
#   - Redis: keyspace_hits y keyspace_misses (INFO stats);
#   - PostgreSQL: conexiones por estado (pg_stat_activity) y aciertos de su caché (pg_stat_database).
# Si un servicio no responde (por ejemplo, Redis detenido a propósito), se anota y se sigue.
#   sh tests/carga/medir-recursos.sh resultados/recursos.jsonl resultados/.midiendo &
set -u

SALIDA="${1:?Uso: medir-recursos.sh <salida.jsonl> <bandera>}"
BANDERA="${2:?Falta el archivo bandera}"
COMPOSE="docker compose -f infra/docker-compose.yml -f tests/carga/compose-carga.yml"
touch "$BANDERA"

while [ -f "$BANDERA" ]; do
  hora="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker stats --no-stream --format '{{json .}}' 2>/dev/null | while IFS= read -r linea; do
    printf '{"hora":"%s","tipo":"contenedor","datos":%s}\n' "$hora" "$linea"
  done >> "$SALIDA"

  redis="$($COMPOSE exec -T redis redis-cli INFO stats 2>/dev/null | tr -d '\r' | grep -E '^keyspace_(hits|misses):' | tr '\n' ' ')"
  aciertos="$(printf '%s' "$redis" | sed -n 's/.*keyspace_hits:\([0-9]*\).*/\1/p')"
  fallos="$(printf '%s' "$redis" | sed -n 's/.*keyspace_misses:\([0-9]*\).*/\1/p')"
  printf '{"hora":"%s","tipo":"redis","keyspace_hits":%s,"keyspace_misses":%s}\n' \
    "$hora" "${aciertos:-null}" "${fallos:-null}" >> "$SALIDA"

  conexiones="$($COMPOSE exec -T postgres psql -U licencias -d licencias -tAc \
    "SELECT coalesce(json_object_agg(coalesce(state, 'sin_estado'), n), '{}') FROM (SELECT state, count(*) AS n FROM pg_stat_activity WHERE datname = 'licencias' GROUP BY state) s" 2>/dev/null)"
  bloques="$($COMPOSE exec -T postgres psql -U licencias -d licencias -tAc \
    "SELECT json_build_object('blks_hit', blks_hit, 'blks_read', blks_read, 'xact_commit', xact_commit) FROM pg_stat_database WHERE datname = 'licencias'" 2>/dev/null)"
  printf '{"hora":"%s","tipo":"postgres","conexiones":%s,"bloques":%s}\n' \
    "$hora" "${conexiones:-null}" "${bloques:-null}" >> "$SALIDA"

  sleep 10
done
