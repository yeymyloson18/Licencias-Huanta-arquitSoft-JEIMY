# Modelo de datos: Cierre del Sprint 2 (008)

Sin cambios en el modelo: no hay tablas, columnas, índices ni migraciones nuevas.

## Datos de las mediciones (no se guardan en la base)

| Elemento | Campos | Dónde queda |
| --- | --- | --- |
| Resultado de carga por etapa | usuarios, p50, p95, errores (%), peticiones/s | Artefacto `carga-sprint2` (`resumen.json` y `etapas.md`) y tabla en `atributos-de-calidad.md` |
| Muestra de recursos | hora, contenedor, CPU %, memoria, `keyspace_hits` y `keyspace_misses`, conexiones de PostgreSQL por estado, `blks_hit` y `blks_read` | Artefacto `recursos.jsonl` |
| Comparación de caché | p50 y p95 del catálogo con Redis y sin Redis | Artefactos `cache-con.json` y `cache-sin.json`, tabla en `cache.md` |
| Plan de consulta | consulta, plan, índice usado, tiempo, buffers | Artefacto `planes.txt`, copiado en `base-de-datos.md` |
| Evidencia de calidad | EQ, estímulo, medida, herramienta, resultado, enlace, estado | `atributos-de-calidad.md` |

## Siembra de 10,000 expedientes (solo en el ejecutor del CI)

`tests/analisis/sembrar-10000.sql` crea esto en un PostgreSQL efímero, con los esquemas de las
migraciones:

- **Expedientes**: 10,000, con números `EXP-2025-1xxxxx`. Los estados se reparten con la proporción de
  un año de trámite y las fechas de presentación cubren los últimos 12 meses. Los documentos son
  ficticios y los HMAC se calculan con `sha256` del número (no son datos reales).
- **Historial**: REGISTRADO y, en el 60 %, una decisión final.
- **Esquelas**: 6,000, de las cuales 4,000 están pagadas.
- **Eventos pendientes**: 2,000.
