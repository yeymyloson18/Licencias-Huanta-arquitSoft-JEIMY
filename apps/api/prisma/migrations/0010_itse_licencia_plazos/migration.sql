-- =====================================================================================
-- 0010: inspección ITSE, licencia con QR, plazos en días hábiles y avisos (funcionalidad 006)
-- specs/006-itse-licencia-plazos/data-model.md. Las tablas de inspecciones, licencias, plazos y
-- notificaciones ya existen desde la 0001; aquí solo se agrega lo que faltaba.
-- =====================================================================================

-- 1. Suspensión del plazo del expediente (research §R-04): días hábiles que quedaban al pasar a
--    OBSERVADO o PENDIENTE_PAGO.
ALTER TABLE tramites.expediente
    ADD COLUMN plazo_restante_dias smallint
        CONSTRAINT expediente_plazo_restante_check
        CHECK (plazo_restante_dias IS NULL OR plazo_restante_dias >= 0);

-- 2. Certificado ITSE que registra el inspector con el resultado favorable (research §R-01).
ALTER TABLE inspecciones.inspeccion
    ADD COLUMN numero_certificado varchar(30),
    ADD COLUMN certificado_emitido_en date,
    ADD CONSTRAINT inspeccion_certificado_check
        CHECK ((numero_certificado IS NULL) = (certificado_emitido_en IS NULL));

-- 3. Quién atendió la alerta (research §R-08).
ALTER TABLE plazos.alerta ADD COLUMN atendida_por uuid;

-- 4. Avisos idempotentes por evento y con espera entre reintentos (research §R-02 y §R-16).
ALTER TABLE notificaciones.mensaje
    ADD COLUMN evento_id bigint CONSTRAINT mensaje_evento_id_key UNIQUE,
    ADD COLUMN reintentar_en timestamptz;

-- 5. Feriados nacionales de Perú de 2026 (research §R-17; D. Leg. N.° 713 y modificatorias).
INSERT INTO plazos.feriado (fecha, descripcion, alcance, registrado_por) VALUES
    ('2026-01-01', 'Año Nuevo',                           'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-04-02', 'Jueves Santo',                        'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-04-03', 'Viernes Santo',                       'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-05-01', 'Día del Trabajo',                     'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-06-07', 'Batalla de Arica y Día de la Bandera', 'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-06-29', 'San Pedro y San Pablo',               'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-07-23', 'Día de la Fuerza Aérea del Perú',     'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-07-28', 'Fiestas Patrias',                     'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-07-29', 'Fiestas Patrias',                     'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-08-06', 'Batalla de Junín',                    'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-08-30', 'Santa Rosa de Lima',                  'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-10-08', 'Combate de Angamos',                  'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-11-01', 'Todos los Santos',                    'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-12-08', 'Inmaculada Concepción',               'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-12-09', 'Batalla de Ayacucho',                 'NACIONAL', '00000000-0000-0000-0000-000000000000'),
    ('2026-12-25', 'Navidad',                             'NACIONAL', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (fecha) DO NOTHING;

-- 6. Los cambios de estado anteriores a la 006 no generan avisos atrasados (análisis H3).
UPDATE comun.evento_pendiente SET procesado_en = now()
 WHERE tipo = 'EstadoExpedienteCambiado' AND procesado_en IS NULL;
