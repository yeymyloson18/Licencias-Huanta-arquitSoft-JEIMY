-- =====================================================================================
-- Migración 0008: evaluación del expediente, esquela de pago y pago en caja (funcionalidad 005)
-- specs/005-evaluacion-pago/data-model.md. Las migraciones 0001 a 0007 ya están aplicadas: no se
-- editan. El estado resultante está en docs/05-modelo-de-datos/esquema.sql.
-- =====================================================================================

-- 1. Acciones nuevas de la auditoría de trámites: empezar la revisión y subsanar (FR-029).
ALTER TABLE tramites.auditoria DROP CONSTRAINT auditoria_accion_check;
ALTER TABLE tramites.auditoria
    ADD CONSTRAINT auditoria_accion_check CHECK (accion IN
        ('CONFIRMAR_RIESGO', 'CORREGIR_RIESGO', 'APROBAR', 'OBSERVAR', 'DENEGAR', 'REGISTRAR_PRESENCIAL',
         'PRESENTAR_EN_LINEA', 'VER_DETALLE', 'INICIAR_EVALUACION', 'SUBSANAR'));

-- 2. El plazo para subsanar en días hábiles se calcula en la funcionalidad 006.
ALTER TABLE tramites.observacion ALTER COLUMN plazo_subsanar_en DROP NOT NULL;

-- 3. Espera entre reintentos del despachador de eventos (research §R-02 de la 005). El índice parcial
--    ix_evento_pendiente_sin_procesar de la 0001 ya cubre la búsqueda de eventos pendientes.
ALTER TABLE comun.evento_pendiente ADD COLUMN reintentar_en timestamptz;
