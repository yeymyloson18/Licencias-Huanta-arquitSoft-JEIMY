-- =====================================================================================
-- Migración 0006: presentar solicitud y consultar el estado del trámite (funcionalidad 004)
-- Detalle: specs/004-solicitud-consulta/data-model.md §1. El estado resultante está descrito en
-- docs/05-modelo-de-datos/esquema.sql, y la prueba esquema-equivalente.e2e-spec.ts verifica que
-- coinciden (research.md §R-08 de la 003). Las migraciones 0001 a 0005 ya están aplicadas: no se
-- editan. Las tablas de trámites están vacías hasta esta funcionalidad, así que las columnas
-- obligatorias nuevas no necesitan valor por defecto.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- expediente: receta con la que se presentó (FR-017), permiso de identidad usado (uso único,
-- research §R-04) y si actuó un representante. Las referencias a otros módulos son lógicas, sin FK
-- (MD2).
-- -------------------------------------------------------------------------------------
ALTER TABLE tramites.expediente
    ADD COLUMN receta_al_presentar jsonb   NOT NULL,              -- tasa, plazo, calificación, ITSE y requisitos al presentar
    ADD COLUMN verificacion_id     uuid,                          -- ref. lógica a seguridad.verificacion_identidad (en línea)
    ADD COLUMN con_representante   boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT expediente_numero_formato_check CHECK (numero ~ '^EXP-[0-9]{4}-[0-9]{6}$'),
    ADD CONSTRAINT expediente_canal_verificacion_check CHECK ((canal = 'EN_LINEA') = (verificacion_id IS NOT NULL)),
    ADD CONSTRAINT expediente_canal_registrado_por_check CHECK ((canal = 'MESA_PARTES') = (registrado_por IS NOT NULL)),
    ADD CONSTRAINT expediente_representante_check CHECK (con_representante = (representante_cifrado IS NOT NULL));

-- Un permiso de identidad, un expediente (aclaración 2): un segundo uso choca aquí, en la misma
-- transacción que crea el expediente.
CREATE UNIQUE INDEX ux_expediente_verificacion ON tramites.expediente (verificacion_id)
    WHERE verificacion_id IS NOT NULL;

-- -------------------------------------------------------------------------------------
-- documento_temporal: archivos subidos antes de presentar (FR-013). Solo los puede usar quien los
-- subió y se descartan a las 24 horas (FR-014, research §R-09).
-- -------------------------------------------------------------------------------------
CREATE TABLE tramites.documento_temporal (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    clave_almacen       varchar(300)  NOT NULL UNIQUE,          -- nombre aleatorio en el almacén, nunca el original
    nombre_original     varchar(255)  NOT NULL,
    tipo_mime           varchar(80)   NOT NULL CHECK (tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png')),
    tamano_bytes        integer       NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 10485760),  -- máx. 10 MB
    sha256              char(64)      NOT NULL,
    verificacion_id     uuid,                                   -- subido en línea (ref. lógica, sin FK)
    usuario_id          uuid,                                   -- subido en mesa de partes (ref. lógica, sin FK)
    subido_en           timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT documento_temporal_quien_check CHECK ((verificacion_id IS NULL) <> (usuario_id IS NULL))
);
CREATE INDEX ix_documento_temporal_subido_en ON tramites.documento_temporal (subido_en);

-- documento: orden del requisito en la receta al presentar, para mostrarlos en ese orden aunque el
-- catálogo cambie después.
ALTER TABLE tramites.documento ADD COLUMN requisito_orden smallint NOT NULL;

-- -------------------------------------------------------------------------------------
-- clave_idempotencia: la misma solicitud enviada dos veces no crea dos expedientes (FR-020).
-- -------------------------------------------------------------------------------------
CREATE TABLE tramites.clave_idempotencia (
    clave               uuid          PRIMARY KEY,              -- cabecera Idempotency-Key
    huella_cuerpo       char(64)      NOT NULL,                 -- SHA-256 del cuerpo canónico
    expediente_id       uuid          NOT NULL REFERENCES tramites.expediente (id),
    creada_en           timestamptz   NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------------------
-- auditoria: presentar en línea (sin usuario del personal) y ver el detalle (FR-036). Se conserva
-- el nombre de la restricción de acciones.
-- -------------------------------------------------------------------------------------
ALTER TABLE tramites.auditoria DROP CONSTRAINT auditoria_accion_check;
ALTER TABLE tramites.auditoria
    ADD CONSTRAINT auditoria_accion_check CHECK (accion IN
        ('CONFIRMAR_RIESGO', 'CORREGIR_RIESGO', 'APROBAR', 'OBSERVAR', 'DENEGAR', 'REGISTRAR_PRESENCIAL',
         'PRESENTAR_EN_LINEA', 'VER_DETALLE')),
    ALTER COLUMN usuario_id DROP NOT NULL,
    ADD CONSTRAINT auditoria_usuario_check CHECK (accion = 'PRESENTAR_EN_LINEA' OR usuario_id IS NOT NULL);

-- -------------------------------------------------------------------------------------
-- verificacion_identidad: huella del documento del representante, que también se comprueba con el
-- servicio de identificación (research §R-01). Solo huellas, nunca datos en claro (research §R-05).
-- -------------------------------------------------------------------------------------
ALTER TABLE seguridad.verificacion_identidad
    ADD COLUMN representante_documento_hmac bytea,
    ADD CONSTRAINT verificacion_identidad_representante_check
        CHECK (con_representante = (representante_documento_hmac IS NOT NULL));
