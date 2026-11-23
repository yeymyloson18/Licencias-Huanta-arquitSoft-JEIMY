-- =====================================================================================
-- Planes de ejecución de las consultas críticas con 10,000 expedientes (008, research §R-07).
-- Corre en el job `planes-bd` después de sembrar-10000.sql. Cada consulta es la misma que ejecuta el
-- código (el archivo se cita arriba de cada una); los parámetros se toman de los datos sembrados.
-- La salida se copia a docs/08-sprint-2/base-de-datos.md.
-- =====================================================================================

\set ON_ERROR_STOP on
\pset pager off

-- Parámetros reales tomados de los datos sembrados.
SELECT numero AS num_consulta, encode(documento_hmac, 'hex') AS hmac_consulta
  FROM tramites.expediente WHERE numero LIKE 'EXP-2025-1%' ORDER BY numero OFFSET 4321 LIMIT 1 \gset
SELECT codigo AS esquela_codigo FROM pagos.esquela ORDER BY codigo OFFSET 2500 LIMIT 1 \gset

\echo '=== 1. Bandeja con filtros (tramites/infraestructura/repositorio-expedientes-postgres.ts, listar) ==='
\echo '--- 1a. Página de la bandeja por estado, de la más nueva a la más antigua'
EXPLAIN (ANALYZE, BUFFERS)
SELECT numero, codigo_receta, ruta, estado, canal, nombre_titular, presentado_en, vence_plazo_en
  FROM tramites.expediente
 WHERE estado = 'EN_EVALUACION'
 ORDER BY presentado_en DESC, numero DESC
 LIMIT 20 OFFSET 0;
\echo '--- 1b. Total de la página (mismo filtro)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM tramites.expediente WHERE estado = 'EN_EVALUACION';

\echo '=== 2. Consulta pública por número y huella del documento (repositorio-expedientes-postgres.ts, buscarParaConsulta) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT numero, estado, ruta, codigo_receta, presentado_en
  FROM tramites.expediente
 WHERE numero = :'num_consulta'
   AND (documento_hmac = decode(:'hmac_consulta', 'hex') OR ruc_hmac = decode(:'hmac_consulta', 'hex'))
 LIMIT 1;

\echo '=== 3. Tablero (tramites/infraestructura/lector-para-reportes-postgres.ts) ==='
\echo '--- 3a. Expedientes presentados en el mes, por estado (conteoPorEstado)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT estado, count(*)
  FROM tramites.expediente
 WHERE presentado_en >= date_trunc('month', now()) AND presentado_en < now()
 GROUP BY estado;
\echo '--- 3b. Primera decisión final en el mes (terminados)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT e.id, e.numero, e.codigo_receta, e.presentado_en, d.terminado_en
  FROM (SELECT expediente_id, MIN(ocurrido_en) AS terminado_en
          FROM tramites.historial_estado
         WHERE estado_nuevo IN ('APROBADO', 'LICENCIA_EMITIDA', 'LICENCIA_PROVISIONAL', 'DENEGADO')
           AND expediente_id IN (SELECT expediente_id
                                   FROM tramites.historial_estado
                                  WHERE estado_nuevo IN ('APROBADO', 'LICENCIA_EMITIDA', 'LICENCIA_PROVISIONAL', 'DENEGADO')
                                    AND ocurrido_en >= date_trunc('month', now()) AND ocurrido_en < now())
         GROUP BY expediente_id) d
  JOIN tramites.expediente e ON e.id = d.expediente_id
 WHERE d.terminado_en >= date_trunc('month', now()) AND d.terminado_en < now();
\echo '--- 3c. Pagos registrados en el mes (pagos/infraestructura/repositorio-esquelas-postgres.ts, pagadasEntre)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT codigo_receta, monto, pagada_en
  FROM pagos.esquela
 WHERE pagada_en >= date_trunc('month', now()) AND pagada_en < now();

\echo '=== 4. Búsqueda de una esquela en caja (repositorio-esquelas-postgres.ts, obtener) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM pagos.esquela WHERE codigo = :'esquela_codigo';

\echo '=== 5. Toma de eventos pendientes (compartido/infraestructura/despachador-eventos.ts) ==='
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, tipo, datos, intentos
  FROM comun.evento_pendiente
 WHERE procesado_en IS NULL
   AND tipo = ANY (ARRAY['EstadoExpedienteCambiado', 'PagoRegistrado']::varchar[])
   AND (reintentar_en IS NULL OR reintentar_en <= now())
 ORDER BY id
 LIMIT 50
   FOR UPDATE SKIP LOCKED;
ROLLBACK;

\echo '=== 6. Reloj de plazos: expedientes con plazo corriendo (tramites/infraestructura/repositorio-vencimientos-postgres.ts, conPlazo) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT numero, estado, vence_plazo_en
  FROM tramites.expediente
 WHERE estado IN ('REGISTRADO', 'EN_EVALUACION', 'PAGADO', 'EN_INSPECCION', 'APROBADO')
   AND vence_plazo_en IS NOT NULL;

\echo '=== Índices y su uso tras los planes (pg_stat_user_indexes) ==='
SELECT schemaname || '.' || relname AS tabla, indexrelname AS indice, idx_scan AS usos
  FROM pg_stat_user_indexes
 WHERE schemaname IN ('tramites', 'pagos', 'comun', 'licencias', 'plazos')
 ORDER BY schemaname, relname, indexrelname;

\echo '=== Aciertos de la caché de PostgreSQL (pg_stat_database) ==='
SELECT blks_hit, blks_read,
       round(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2) AS porcentaje_aciertos
  FROM pg_stat_database WHERE datname = current_database();
