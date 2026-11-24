-- =====================================================================================
-- 0012: auditoría de seguridad (funcionalidad 009)
-- specs/009-panel-administrador/data-model.md §1. Solo agrega una tabla nueva: es compatible con la
-- versión anterior del servicio. El estado resultante está en docs/05-modelo-de-datos/esquema.sql
-- (la prueba esquema-equivalente compara). Las migraciones 0001 a 0011 no se editan.
-- =====================================================================================

-- Quién hizo qué y cuándo en los accesos y la configuración (HU15 ampliada, FR-006 de la 009).
-- Sin datos personales: identificadores internos, código de receta o fecha de feriado, y el origen
-- solo como HMAC (FR-013). Solo se agregan filas (FR-012).
CREATE TABLE seguridad.auditoria (
    id                  bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ocurrido_en         timestamptz  NOT NULL DEFAULT now(),
    accion              varchar(30)  NOT NULL,
    actor_usuario_id    uuid         NULL,                  -- ref. lógica a seguridad.usuario
    afectado_usuario_id uuid         NULL,                  -- ref. lógica a seguridad.usuario
    objeto              varchar(40)  NULL,                  -- código de receta o fecha del feriado
    resultado           varchar(10)  NOT NULL,
    origen_hmac         char(64)     NULL,                  -- HMAC-SHA256 de la IP (hexadecimal)
    detalle             jsonb        NOT NULL DEFAULT '{}'::jsonb,
    evento_origen_id    bigint       NULL,                  -- id de comun.evento_pendiente (idempotencia)
    CONSTRAINT ck_auditoria_seg_accion CHECK (accion IN (
        'INGRESO_CORRECTO', 'CLAVE_INCORRECTA', 'CODIGO_INCORRECTO', 'CUENTA_BLOQUEADA',
        'ORIGEN_BLOQUEADO', 'CIERRE_SESION', 'CLAVE_CAMBIADA',
        'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO',
        'ROL_ASIGNADO', 'ROL_QUITADO', 'CLAVE_TEMPORAL_ASIGNADA', 'SESIONES_CERRADAS',
        'CUENTA_DESBLOQUEADA',
        'RECETA_ACTUALIZADA', 'RECETA_DESACTIVADA', 'RECETA_REACTIVADA',
        'FERIADO_REGISTRADO', 'FERIADO_ELIMINADO')),
    CONSTRAINT ck_auditoria_seg_resultado CHECK (resultado IN ('EXITO', 'RECHAZADO')),
    CONSTRAINT ck_auditoria_seg_origen CHECK (origen_hmac IS NULL OR origen_hmac ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ux_auditoria_seg_evento_origen UNIQUE (evento_origen_id)
);
CREATE INDEX ix_auditoria_seg_ocurrido ON seguridad.auditoria (ocurrido_en DESC, id DESC);
CREATE INDEX ix_auditoria_seg_accion ON seguridad.auditoria (accion, ocurrido_en DESC);
CREATE INDEX ix_auditoria_seg_afectado ON seguridad.auditoria (afectado_usuario_id, ocurrido_en DESC)
    WHERE afectado_usuario_id IS NOT NULL;
CREATE INDEX ix_auditoria_seg_actor ON seguridad.auditoria (actor_usuario_id, ocurrido_en DESC)
    WHERE actor_usuario_id IS NOT NULL;

-- Solo de agregar: el usuario de la aplicación es dueño de la tabla y REVOKE no lo limitaría.
CREATE FUNCTION seguridad.auditoria_solo_agregar() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'La auditoría de seguridad no se puede modificar ni borrar';
END;
$$;
CREATE TRIGGER tg_auditoria_seg_sin_cambios
    BEFORE UPDATE OR DELETE ON seguridad.auditoria
    FOR EACH ROW EXECUTE FUNCTION seguridad.auditoria_solo_agregar();
CREATE TRIGGER tg_auditoria_seg_sin_vaciar
    BEFORE TRUNCATE ON seguridad.auditoria
    FOR EACH STATEMENT EXECUTE FUNCTION seguridad.auditoria_solo_agregar();
