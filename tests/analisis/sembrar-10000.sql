-- =====================================================================================
-- Siembra de 10,000 expedientes FICTICIOS para el análisis de la base de datos (008, research §R-07).
-- Corre SOLO en el PostgreSQL efímero del job `planes-bd` (.github/workflows/carga-sprint2.yml),
-- después de `prisma migrate deploy`. Nada aquí es un dato real: los documentos y celulares son bytes
-- inventados y las "huellas" (HMAC) son sha256 del número de expediente.
-- =====================================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Estados repartidos como en un año de trámite (la mayoría ya terminó).
CREATE TEMP TABLE reparto (estado text, desde int, hasta int);
INSERT INTO reparto VALUES
  ('REGISTRADO', 0, 6), ('EN_EVALUACION', 6, 14), ('OBSERVADO', 14, 18), ('PENDIENTE_PAGO', 18, 24),
  ('PAGADO', 24, 28), ('EN_INSPECCION', 28, 32), ('APROBADO', 32, 33), ('LICENCIA_PROVISIONAL', 33, 38),
  ('ITSE_POSTERIOR_PENDIENTE', 38, 44), ('FINALIZADO', 44, 90), ('DENEGADO', 90, 100);

INSERT INTO tramites.expediente
  (numero, codigo_receta, ruta, estado, canal, tipo_documento, documento_cifrado, documento_hmac,
   ruc_cifrado, ruc_hmac, nombre_titular, celular_cifrado, giro, direccion_cifrada, zona, area_m2,
   presentado_en, vence_plazo_en, evaluador_id, registrado_por, verificacion_id, receta_al_presentar)
SELECT
  'EXP-2025-' || lpad((100000 + g)::text, 6, '0'),
  (ARRAY['LIC-01', 'LIC-02', 'LIC-03', 'LIC-04', 'LIC-09'])[1 + g % 5],
  (ARRAY['A', 'A', 'B', 'B', 'C'])[1 + g % 5],
  r.estado,
  CASE WHEN g % 3 = 0 THEN 'MESA_PARTES' ELSE 'EN_LINEA' END,
  'DNI',
  convert_to('ficticio-' || g, 'UTF8'),
  sha256(convert_to('EXP-2025-' || lpad((100000 + g)::text, 6, '0'), 'UTF8')),
  convert_to('ruc-ficticio-' || g, 'UTF8'),
  sha256(convert_to('RUC-' || g, 'UTF8')),
  'Titular Ficticio ' || g,
  convert_to('cel-ficticio-' || g, 'UTF8'),
  (ARRAY['Bodega', 'Restaurante', 'Farmacia', 'Ferretería', 'Librería'])[1 + g % 5],
  convert_to('dir-ficticia-' || g, 'UTF8'),
  (ARRAY['Centro', 'Pampa', 'Barrio Alto', 'Callqui'])[1 + g % 4],
  40,
  now() - ((g % 365) || ' days')::interval - ((g % 24) || ' hours')::interval,
  CASE WHEN r.estado IN ('REGISTRADO', 'EN_EVALUACION', 'PAGADO', 'EN_INSPECCION')
       THEN (now() + ((g % 15) - 3 || ' days')::interval)::date END,
  CASE WHEN g % 4 = 0 THEN gen_random_uuid() END,
  CASE WHEN g % 3 = 0 THEN gen_random_uuid() END,
  CASE WHEN g % 3 <> 0 THEN gen_random_uuid() END,
  '{"plazoDias": 8, "nombre": "Licencia ficticia"}'::jsonb
FROM generate_series(1, 10000) g
JOIN reparto r ON (g % 100) >= r.desde AND (g % 100) < r.hasta;

-- Historial: REGISTRADO para todos y una decisión final para los que ya terminaron.
INSERT INTO tramites.historial_estado (expediente_id, estado_anterior, estado_nuevo, ocurrido_en)
SELECT id, NULL, 'REGISTRADO', presentado_en FROM tramites.expediente WHERE numero LIKE 'EXP-2025-1%';

INSERT INTO tramites.historial_estado (expediente_id, estado_anterior, estado_nuevo, ocurrido_en)
SELECT id, 'PAGADO',
       CASE WHEN estado = 'DENEGADO' THEN 'DENEGADO'
            WHEN estado = 'LICENCIA_PROVISIONAL' THEN 'LICENCIA_PROVISIONAL'
            ELSE 'APROBADO' END,
       presentado_en + interval '6 days'
  FROM tramites.expediente
 WHERE numero LIKE 'EXP-2025-1%'
   AND estado IN ('APROBADO', 'LICENCIA_PROVISIONAL', 'ITSE_POSTERIOR_PENDIENTE', 'FINALIZADO', 'DENEGADO');

-- Esquelas: 6,000, de las cuales 4,000 pagadas.
INSERT INTO pagos.esquela
  (codigo, numero_expediente, codigo_receta, concepto, monto, generada_en, numero_recibo, pagada_en, registrado_por)
SELECT 'ESQ-' || e.numero, e.numero, e.codigo_receta, 'Licencia de funcionamiento (ficticia)', 177.10,
       e.presentado_en + interval '2 days',
       CASE WHEN n <= 4000 THEN 'REC-' || n END,
       CASE WHEN n <= 4000 THEN e.presentado_en + interval '3 days' END,
       CASE WHEN n <= 4000 THEN gen_random_uuid() END
  FROM (SELECT numero, codigo_receta, presentado_en, row_number() OVER (ORDER BY numero) AS n
          FROM tramites.expediente WHERE numero LIKE 'EXP-2025-1%') e
 WHERE e.n <= 6000;

-- Cola de eventos: 2,000 pendientes y 8,000 ya procesados (como tras meses de uso).
INSERT INTO comun.evento_pendiente (tipo, datos, creado_en, procesado_en)
SELECT 'EstadoExpedienteCambiado', jsonb_build_object('numeroExpediente', 'EXP-2025-' || lpad((100000 + g)::text, 6, '0')),
       now() - (g || ' minutes')::interval,
       CASE WHEN g > 2000 THEN now() - (g || ' minutes')::interval + interval '2 seconds' END
  FROM generate_series(1, 10000) g;

COMMIT;

ANALYZE;

SELECT 'expedientes' AS tabla, count(*) FROM tramites.expediente
UNION ALL SELECT 'historial', count(*) FROM tramites.historial_estado
UNION ALL SELECT 'esquelas', count(*) FROM pagos.esquela
UNION ALL SELECT 'eventos pendientes', count(*) FROM comun.evento_pendiente WHERE procesado_en IS NULL;
