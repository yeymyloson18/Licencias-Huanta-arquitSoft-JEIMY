-- =====================================================================================
-- 0013: códigos enviados en la auditoría de seguridad (funcionalidad 010)
-- specs/010-codigo-enviado/data-model.md §1. Amplía las acciones y agrega el identificador del
-- intento (id del desafío del ingreso del personal) para vincular cada código con su resultado. El
-- estado resultante está en docs/05-modelo-de-datos/esquema.sql. Las migraciones 0001 a 0012 no se
-- editan.
-- =====================================================================================

ALTER TABLE seguridad.auditoria DROP CONSTRAINT ck_auditoria_seg_accion;
ALTER TABLE seguridad.auditoria ADD CONSTRAINT ck_auditoria_seg_accion CHECK (accion IN (
    'INGRESO_CORRECTO', 'CLAVE_INCORRECTA', 'CODIGO_INCORRECTO', 'CUENTA_BLOQUEADA',
    'ORIGEN_BLOQUEADO', 'CIERRE_SESION', 'CLAVE_CAMBIADA', 'CODIGO_ENVIADO',
    'CODIGO_LIMITE_ALCANZADO',
    'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO',
    'ROL_ASIGNADO', 'ROL_QUITADO', 'CLAVE_TEMPORAL_ASIGNADA', 'SESIONES_CERRADAS',
    'CUENTA_DESBLOQUEADA',
    'RECETA_ACTUALIZADA', 'RECETA_DESACTIVADA', 'RECETA_REACTIVADA',
    'FERIADO_REGISTRADO', 'FERIADO_ELIMINADO'));

-- Id del desafío (seguridad.codigo_otp.id, sin FK: el historial no depende de los códigos). No es un
-- dato personal y la API no lo expone.
ALTER TABLE seguridad.auditoria ADD COLUMN intento_id uuid NULL;
CREATE INDEX ix_auditoria_seg_intento ON seguridad.auditoria (intento_id)
    WHERE intento_id IS NOT NULL;
