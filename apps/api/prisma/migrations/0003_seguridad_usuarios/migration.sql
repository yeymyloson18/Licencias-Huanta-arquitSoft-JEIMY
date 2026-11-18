-- =====================================================================================
-- Migración 0003: seguridad y usuarios del personal (funcionalidad 002)
-- Detalle: specs/002-seguridad-usuarios/data-model.md §1. El estado resultante está descrito en
-- docs/05-modelo-de-datos/esquema.sql y la prueba esquema-equivalente.e2e-spec.ts verifica que
-- coinciden (research.md §R-15). Las migraciones 0001 y 0002 ya están aplicadas: no se editan.
-- =====================================================================================

-- El correo pasa a guardarse cifrado (MD3) y eso no se puede hacer desde SQL (la clave vive en la
-- aplicación). Hoy ningún entorno tiene usuarios: esta funcionalidad crea el primero.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM seguridad.usuario) THEN
        RAISE EXCEPTION 'La migración 0003 cifra el correo y requiere que seguridad.usuario esté vacía';
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- usuario: correo cifrado + HMAC (MD3, research §R-04), clave temporal (FR-022) y versión de
-- seguridad para revocar al instante (FR-011, FR-015, research §R-07)
-- -------------------------------------------------------------------------------------
ALTER TABLE seguridad.usuario DROP CONSTRAINT usuario_correo_key;
ALTER TABLE seguridad.usuario DROP COLUMN correo;
ALTER TABLE seguridad.usuario
    ADD COLUMN correo_cifrado     bytea   NOT NULL,
    ADD COLUMN correo_hmac        bytea   NOT NULL UNIQUE,
    ADD COLUMN debe_cambiar_clave boolean NOT NULL DEFAULT false,
    ADD COLUMN version_seguridad  integer NOT NULL DEFAULT 1 CHECK (version_seguridad > 0);

-- -------------------------------------------------------------------------------------
-- usuario_rol: historial de asignaciones (FR-019, aclaración del 2026-11-17). Un rol vigente por
-- usuario una sola vez; las asignaciones retiradas se conservan.
-- -------------------------------------------------------------------------------------
ALTER TABLE seguridad.usuario_rol DROP CONSTRAINT usuario_rol_pkey;
ALTER TABLE seguridad.usuario_rol
    ADD COLUMN id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    ADD COLUMN retirado_por uuid        NULL,                  -- ref. lógica a seguridad.usuario
    ADD COLUMN retirado_en  timestamptz NULL,
    ADD CONSTRAINT ck_usuario_rol_retiro CHECK ((retirado_por IS NULL) = (retirado_en IS NULL));
CREATE UNIQUE INDEX ux_usuario_rol_vigente ON seguridad.usuario_rol (usuario_id, rol_codigo)
    WHERE retirado_en IS NULL;
CREATE INDEX ix_usuario_rol_admin_vigente ON seguridad.usuario_rol (rol_codigo)
    WHERE retirado_en IS NULL;

-- -------------------------------------------------------------------------------------
-- sesion: máximo de 8 horas (FR-003), cierre tras 30 minutos sin renovar (FR-003a) y rotación del
-- refresh token con detección de reutilización (research §R-06)
-- -------------------------------------------------------------------------------------
ALTER TABLE seguridad.sesion DROP COLUMN vence_en;
ALTER TABLE seguridad.sesion
    ADD COLUMN vence_maximo_en       timestamptz  NOT NULL,
    ADD COLUMN ultima_actividad_en   timestamptz  NOT NULL DEFAULT now(),
    ADD COLUMN refresh_anterior_hash varchar(255) NULL,
    ADD COLUMN rotada_en             timestamptz  NULL;
CREATE INDEX ix_sesion_usuario_vigente ON seguridad.sesion (usuario_id) WHERE revocada_en IS NULL;
