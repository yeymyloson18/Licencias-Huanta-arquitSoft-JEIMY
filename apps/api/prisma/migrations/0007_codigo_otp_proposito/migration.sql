-- =====================================================================================
-- Migración 0007: amplía seguridad.codigo_otp.proposito (funcionalidad 004)
-- El CHECK de la 0001 ya admitía 'IDENTIDAD_ADMINISTRADO' (22 caracteres), pero la columna era
-- varchar(20): el primer código de identidad del administrado no cabía. Las migraciones 0001 a
-- 0006 ya están aplicadas: no se editan. El estado resultante está en esquema.sql.
-- =====================================================================================

-- La restricción se vuelve a crear con el mismo nombre para que quede igual a la de esquema.sql (al
-- cambiar el tipo, PostgreSQL reescribe su expresión).
ALTER TABLE seguridad.codigo_otp DROP CONSTRAINT codigo_otp_proposito_check;
ALTER TABLE seguridad.codigo_otp ALTER COLUMN proposito TYPE varchar(25);
ALTER TABLE seguridad.codigo_otp
    ADD CONSTRAINT codigo_otp_proposito_check CHECK (proposito IN ('INICIO_SESION', 'IDENTIDAD_ADMINISTRADO'));
