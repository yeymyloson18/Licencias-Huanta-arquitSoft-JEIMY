-- =====================================================================================
-- 0011: índices para el tablero y el reporte de licencias (funcionalidad 007)
-- specs/007-tablero-despliegue/data-model.md §2. Solo agrega índices: es compatible con la versión
-- anterior del servicio y con la vuelta atrás del despliegue (FR-035).
-- =====================================================================================

-- Expedientes presentados en un rango (conteo por estado del tablero).
CREATE INDEX ix_expediente_presentado ON tramites.expediente (presentado_en);

-- Expedientes cuya atención terminó en un rango (primera decisión final).
CREATE INDEX ix_historial_decision ON tramites.historial_estado (ocurrido_en)
    WHERE estado_nuevo IN ('APROBADO', 'LICENCIA_EMITIDA', 'LICENCIA_PROVISIONAL', 'DENEGADO');

-- Reporte de licencias vigentes por tipo de licencia.
CREATE INDEX ix_licencia_situacion ON licencias.licencia (estado, codigo_receta);

-- Reporte de certificados ITSE por vencer (el índice de la 006 solo cubre los no avisados).
CREATE INDEX ix_certificado_vence ON licencias.certificado_itse (vence_en);
