-- =====================================================================================
-- Sistema de Trámite de Licencias de Funcionamiento – Municipalidad Provincial de Huanta
-- Modelo físico de datos (PostgreSQL 16)
--
-- Este archivo describe el ESTADO ACTUAL del esquema, después de aplicar todas las migraciones de
-- apps/api/prisma/migrations/ (0001 = versión inicial de este archivo; 0003 = seguridad y usuarios; 0004 = catálogo y asistente).
-- La prueba esquema-equivalente.e2e-spec.ts verifica que una base creada con este archivo y una
-- base migrada son iguales. Para cambiar el esquema: nueva migración + actualizar este archivo.
--
-- Reglas del modelo (ver modelo-entidad-relacion.md):
--   * Una sola base de datos (RC09) con un ESQUEMA por módulo (ADR-001).
--   * Las claves foráneas solo existen DENTRO de un esquema. Entre módulos se guarda el
--     identificador de negocio (numero_expediente, codigo_receta, usuario_id) sin FK:
--     así ningún módulo depende de las tablas de otro y se puede extraer en el futuro.
--   * Datos personales cifrados con AES-256-GCM en la aplicación (ADR-007): columnas *_cifrado (bytea).
--     Para buscar sin descifrar se guarda un HMAC-SHA256 en la columna *_hmac.
--   * Estados y tipos con CHECK (más fácil de migrar que los ENUM de PostgreSQL).
--   * Fechas con zona horaria (timestamptz); montos en numeric(10,2), en soles.
--
-- Este archivo es la referencia de diseño. En el código, las migraciones se generan con Prisma.
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS comun;
CREATE SCHEMA IF NOT EXISTS seguridad;
CREATE SCHEMA IF NOT EXISTS catalogo;
CREATE SCHEMA IF NOT EXISTS tramites;
CREATE SCHEMA IF NOT EXISTS pagos;
CREATE SCHEMA IF NOT EXISTS inspecciones;
CREATE SCHEMA IF NOT EXISTS licencias;
CREATE SCHEMA IF NOT EXISTS plazos;
CREATE SCHEMA IF NOT EXISTS notificaciones;

-- -------------------------------------------------------------------------------------
-- COMÚN: infraestructura compartida (outbox y ejecución única de tareas programadas)
-- -------------------------------------------------------------------------------------

-- Outbox: el evento se guarda en la MISMA transacción que la operación que lo produce.
CREATE TABLE comun.evento_pendiente (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo            varchar(60)  NOT NULL,              -- PagoRegistrado, ResultadoITSERegistrado, EstadoExpedienteCambiado
    datos           jsonb        NOT NULL,
    creado_en       timestamptz  NOT NULL DEFAULT now(),
    procesado_en    timestamptz,
    intentos        smallint     NOT NULL DEFAULT 0,
    ultimo_error    text
);
CREATE INDEX ix_evento_pendiente_sin_procesar ON comun.evento_pendiente (creado_en) WHERE procesado_en IS NULL;

-- ADR-006: una tarea programada corre una sola vez por día aunque haya N instancias.
CREATE TABLE comun.ejecucion_tarea (
    nombre_tarea    varchar(60)  NOT NULL,              -- VerificarPlazos, AvisarVencimientoITSE
    fecha           date         NOT NULL,
    instancia       varchar(100) NOT NULL,
    iniciada_en     timestamptz  NOT NULL DEFAULT now(),
    terminada_en    timestamptz,
    resultado       varchar(20)  CHECK (resultado IN ('OK', 'ERROR')),
    detalle         text,
    PRIMARY KEY (nombre_tarea, fecha)
);

-- -------------------------------------------------------------------------------------
-- SEGURIDAD Y USUARIOS (RF16, RF17, RF22, ADR-007)
-- -------------------------------------------------------------------------------------

CREATE TABLE seguridad.rol (
    codigo          varchar(20)  PRIMARY KEY CHECK (codigo IN
                    ('MESA_PARTES', 'EVALUADOR', 'INSPECTOR', 'CAJA', 'JEFATURA', 'ADMINISTRADOR')),
    nombre          varchar(60)  NOT NULL
);

CREATE TABLE seguridad.usuario (
    id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_completo    varchar(150) NOT NULL,
    clave_hash         varchar(255) NOT NULL,              -- argon2id
    celular_cifrado    bytea        NOT NULL,              -- destino del OTP
    activo             boolean      NOT NULL DEFAULT true,
    creado_en          timestamptz  NOT NULL DEFAULT now(),
    actualizado_en     timestamptz  NOT NULL DEFAULT now(),
    correo_cifrado     bytea        NOT NULL,              -- AES-256-GCM (MD3)
    correo_hmac        bytea        NOT NULL UNIQUE,       -- búsqueda exacta e inicio de sesión
    debe_cambiar_clave boolean      NOT NULL DEFAULT false, -- clave temporal (FR-022)
    version_seguridad  integer      NOT NULL DEFAULT 1 CHECK (version_seguridad > 0) -- revocación inmediata (FR-011, FR-015)
);

-- Historial de asignaciones de roles (FR-019): las asignaciones retiradas se conservan.
CREATE TABLE seguridad.usuario_rol (
    usuario_id      uuid         NOT NULL REFERENCES seguridad.usuario (id) ON DELETE CASCADE,
    rol_codigo      varchar(20)  NOT NULL REFERENCES seguridad.rol (codigo),
    asignado_por    uuid         NOT NULL,              -- ref. lógica a seguridad.usuario
    asignado_en     timestamptz  NOT NULL DEFAULT now(),
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    retirado_por    uuid         NULL,                  -- ref. lógica a seguridad.usuario
    retirado_en     timestamptz  NULL,
    CONSTRAINT ck_usuario_rol_retiro CHECK ((retirado_por IS NULL) = (retirado_en IS NULL))
);
-- Un rol vigente por usuario una sola vez; contar administradores activos rápido (FR-020).
CREATE UNIQUE INDEX ux_usuario_rol_vigente ON seguridad.usuario_rol (usuario_id, rol_codigo)
    WHERE retirado_en IS NULL;
CREATE INDEX ix_usuario_rol_admin_vigente ON seguridad.usuario_rol (rol_codigo)
    WHERE retirado_en IS NULL;

-- Un código OTP vence a los 5 minutos y admite 5 intentos (diseño interno de módulos).
CREATE TABLE seguridad.codigo_otp (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    proposito       varchar(20)  NOT NULL CHECK (proposito IN ('INICIO_SESION', 'IDENTIDAD_ADMINISTRADO')),
    usuario_id      uuid         REFERENCES seguridad.usuario (id),   -- solo personal municipal
    destino_hmac    bytea        NOT NULL,              -- celular al que se envió (sin guardarlo en claro)
    codigo_hash     varchar(255) NOT NULL,
    intentos        smallint     NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 5),
    vence_en        timestamptz  NOT NULL,
    usado_en        timestamptz,
    creado_en       timestamptz  NOT NULL DEFAULT now(),
    CHECK (proposito <> 'INICIO_SESION' OR usuario_id IS NOT NULL)
);
CREATE INDEX ix_codigo_otp_vigente ON seguridad.codigo_otp (destino_hmac, vence_en) WHERE usado_en IS NULL;

-- Identidad del administrado validada con el servicio externo DNI/RUC + OTP (RF06).
-- Al terminar se entrega un token de identidad de corta duración para presentar la solicitud.
CREATE TABLE seguridad.verificacion_identidad (
    id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_documento        varchar(3)   NOT NULL CHECK (tipo_documento IN ('DNI', 'CE')),
    documento_hmac        bytea        NOT NULL,
    ruc_hmac              bytea        NOT NULL,
    con_representante     boolean      NOT NULL DEFAULT false,
    resultado_servicio    varchar(20)  NOT NULL CHECK (resultado_servicio IN ('VALIDO', 'NO_VALIDO', 'NO_DISPONIBLE')),
    codigo_otp_id         uuid         REFERENCES seguridad.codigo_otp (id),
    confirmada_en         timestamptz,
    creada_en             timestamptz  NOT NULL DEFAULT now()
);

-- Refresh tokens del personal (permite cerrar sesión y revocar).
CREATE TABLE seguridad.sesion (
    id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id            uuid         NOT NULL REFERENCES seguridad.usuario (id) ON DELETE CASCADE,
    refresh_hash          varchar(255) NOT NULL,           -- SHA-256 del refresh vigente
    creada_en             timestamptz  NOT NULL DEFAULT now(),
    revocada_en           timestamptz,
    vence_maximo_en       timestamptz  NOT NULL,           -- creada_en + 8 horas (FR-003)
    ultima_actividad_en   timestamptz  NOT NULL DEFAULT now(), -- última renovación (FR-003a)
    refresh_anterior_hash varchar(255) NULL,               -- detección de reutilización
    rotada_en             timestamptz  NULL
);
CREATE INDEX ix_sesion_usuario_vigente ON seguridad.sesion (usuario_id) WHERE revocada_en IS NULL;

-- -------------------------------------------------------------------------------------
-- CATÁLOGO Y ASISTENTE DE RUTA (RF01, RF02, RF05, RF21, ADR-002)
-- -------------------------------------------------------------------------------------

-- Una receta = un procedimiento del TUPA 2024 (ver 09-validacion-del-tupa.md).
CREATE TABLE catalogo.receta (
    codigo              varchar(10)   PRIMARY KEY,          -- LIC-01 ... LIC-09, TRF-01, CGI-01, DUP-01
    nombre              varchar(150)  NOT NULL,
    tipo                varchar(20)   NOT NULL CHECK (tipo IN ('LICENCIA', 'TRAMITE_CONECTADO')),
    codigo_tupa         varchar(15)   NOT NULL UNIQUE,      -- p. ej. PE1027344C1
    pagina_tupa         smallint      NOT NULL,
    ruta                char(1)       CHECK (ruta IN ('A', 'B', 'C')),
    nivel_riesgo        varchar(10)   CHECK (nivel_riesgo IN ('BAJO', 'MEDIO', 'ALTO', 'MUY_ALTO')),
    es_cesionario       boolean       NOT NULL DEFAULT false,
    es_corporativa      boolean       NOT NULL DEFAULT false,
    tasa                numeric(10,2) NOT NULL CHECK (tasa >= 0),   -- 0 = gratuito (bodega)
    plazo_dias          smallint      CHECK (plazo_dias > 0),
    tipo_plazo          varchar(12)   NOT NULL DEFAULT 'HABILES' CHECK (tipo_plazo IN ('HABILES', 'CALENDARIO')),
    calificacion        varchar(40)   NOT NULL CHECK (calificacion IN
                        ('APROBACION_AUTOMATICA', 'EVALUACION_PREVIA_SILENCIO_POSITIVO', 'SERVICIO_EXCLUSIVO')),
    orden_itse          varchar(15)   CHECK (orden_itse IN ('POSTERIOR', 'PREVIA', 'DENTRO_6_MESES')),
    plazo_itse_dias     smallint,
    vigencia_meses      smallint,                           -- NULL = indeterminada; 12 = provisional de bodega
    activa              boolean       NOT NULL DEFAULT true,
    actualizada_por     uuid,
    actualizada_en      timestamptz   NOT NULL DEFAULT now(),
    CHECK (tipo <> 'LICENCIA' OR (ruta IS NOT NULL AND orden_itse IS NOT NULL))
);

CREATE TABLE catalogo.requisito (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_receta       varchar(10)   NOT NULL REFERENCES catalogo.receta (codigo) ON DELETE CASCADE,
    orden               smallint      NOT NULL,
    descripcion         text          NOT NULL,
    obligatorio         boolean       NOT NULL DEFAULT true,
    condicion           varchar(30)   NOT NULL DEFAULT 'SIEMPRE' CHECK (condicion IN
                        ('SIEMPRE', 'CON_REPRESENTANTE', 'GIRO_ESPECIAL', 'SIN_PLANOS_VIGENTES')),
    acepta_archivo      boolean       NOT NULL DEFAULT true,
    -- Diferible: se verifica al confirmar, para reordenar requisitos en una transacción (003, FR-020).
    UNIQUE (codigo_receta, orden) DEFERRABLE INITIALLY DEFERRED
);

-- Registro inmutable de cada cambio de una receta (003, FR-021): quién, cuándo, antes y después.
CREATE TABLE catalogo.cambio_receta (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_receta       varchar(10)   NOT NULL REFERENCES catalogo.receta (codigo),
    usuario_id          uuid          NOT NULL,             -- ref. lógica a seguridad.usuario (sin FK)
    cambiado_en         timestamptz   NOT NULL DEFAULT now(),
    cambios             jsonb         NOT NULL               -- {"tasa":{"antes":"177.10","despues":"180.00"}}
                        CHECK (jsonb_typeof(cambios) = 'object' AND cambios <> '{}'::jsonb)
);
CREATE INDEX ix_cambio_receta_receta ON catalogo.cambio_receta (codigo_receta, cambiado_en);

-- Preguntas del asistente de 3 preguntas (RF01). Las reglas convierten respuestas en una receta.
CREATE TABLE catalogo.pregunta_asistente (
    codigo              varchar(30)   PRIMARY KEY,          -- TIPO_ESTABLECIMIENTO, NIVEL_RIESGO, ES_CESIONARIO
    orden               smallint      NOT NULL UNIQUE,
    texto               text          NOT NULL,
    opciones            jsonb         NOT NULL               -- [{"valor":"BODEGA","texto":"Bodega de hasta 50 m²"}, ...]
);

CREATE TABLE catalogo.regla_asistente (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prioridad           smallint      NOT NULL,             -- se evalúan de menor a mayor; gana la primera que coincide
    condiciones         jsonb         NOT NULL,             -- {"TIPO_ESTABLECIMIENTO":"BODEGA"}
    codigo_receta       varchar(10)   NOT NULL REFERENCES catalogo.receta (codigo),
    UNIQUE (prioridad)
);

-- -------------------------------------------------------------------------------------
-- TRÁMITES (RF03, RF04, RF06, RF07, RF09, RF15, RF25)
-- -------------------------------------------------------------------------------------

CREATE SEQUENCE tramites.numero_expediente_seq;

CREATE TABLE tramites.expediente (
    id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    numero                  varchar(20)   NOT NULL UNIQUE,      -- EXP-2026-000001
    codigo_receta           varchar(10)   NOT NULL,             -- ref. lógica a catalogo.receta (sin FK)
    ruta                    char(1)       NOT NULL CHECK (ruta IN ('A', 'B', 'C')),
    nivel_riesgo_propuesto  varchar(10)   CHECK (nivel_riesgo_propuesto IN ('BAJO', 'MEDIO', 'ALTO', 'MUY_ALTO')),
    nivel_riesgo_confirmado varchar(10)   CHECK (nivel_riesgo_confirmado IN ('BAJO', 'MEDIO', 'ALTO', 'MUY_ALTO')),
    estado                  varchar(30)   NOT NULL DEFAULT 'REGISTRADO' CHECK (estado IN (
                            'REGISTRADO', 'OBSERVADO', 'EN_EVALUACION', 'PENDIENTE_PAGO', 'PAGADO',
                            'EN_INSPECCION', 'APROBADO', 'LICENCIA_PROVISIONAL', 'LICENCIA_EMITIDA',
                            'ITSE_POSTERIOR_PENDIENTE', 'FINALIZADO', 'DENEGADO', 'DERIVADO_A_FISCALIZACION')),
    canal                   varchar(12)   NOT NULL CHECK (canal IN ('EN_LINEA', 'MESA_PARTES')),
    expediente_origen       varchar(20),                        -- trámites conectados: licencia de origen (RF15)
    -- Titular (datos personales cifrados, Ley N.° 29733)
    tipo_documento          varchar(3)    NOT NULL CHECK (tipo_documento IN ('DNI', 'CE')),
    documento_cifrado       bytea         NOT NULL,
    documento_hmac          bytea         NOT NULL,             -- búsqueda exacta para la consulta pública
    ruc_cifrado             bytea         NOT NULL,
    ruc_hmac                bytea         NOT NULL,
    nombre_titular          varchar(150)  NOT NULL,
    razon_social            varchar(200),
    celular_cifrado         bytea         NOT NULL,
    correo_cifrado          bytea,
    representante_cifrado   bytea,                              -- JSON cifrado del representante, si actúa uno
    -- Establecimiento
    nombre_comercial        varchar(200),
    giro                    varchar(150)  NOT NULL,
    direccion_cifrada       bytea         NOT NULL,
    zona                    varchar(60)   NOT NULL,             -- usada por los reportes (RF18)
    area_m2                 numeric(8,2)  CHECK (area_m2 > 0),
    -- Plazos (RF08)
    presentado_en           timestamptz   NOT NULL DEFAULT now(),
    vence_plazo_en          date,
    evaluador_id            uuid,                               -- ref. lógica a seguridad.usuario
    registrado_por          uuid,                               -- personal de mesa de partes (canal presencial)
    actualizado_en          timestamptz   NOT NULL DEFAULT now(),
    version                 integer       NOT NULL DEFAULT 1    -- bloqueo optimista
);
CREATE INDEX ix_expediente_consulta ON tramites.expediente (numero, documento_hmac);
CREATE INDEX ix_expediente_ruc ON tramites.expediente (ruc_hmac);
CREATE INDEX ix_expediente_estado ON tramites.expediente (estado, vence_plazo_en);
CREATE INDEX ix_expediente_bandeja ON tramites.expediente (evaluador_id, estado);

CREATE TABLE tramites.documento (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    expediente_id       uuid          NOT NULL REFERENCES tramites.expediente (id) ON DELETE CASCADE,
    requisito_id        bigint        NOT NULL,                 -- ref. lógica a catalogo.requisito
    nombre_original     varchar(255)  NOT NULL,
    clave_almacen       varchar(300)  NOT NULL UNIQUE,          -- ruta en el almacén de objetos (cifrado en reposo)
    tipo_mime           varchar(80)   NOT NULL CHECK (tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png')),
    tamano_bytes        integer       NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 10485760),  -- máx. 10 MB
    sha256              char(64)      NOT NULL,
    subido_en           timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX ix_documento_expediente ON tramites.documento (expediente_id);

CREATE TABLE tramites.observacion (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expediente_id       uuid          NOT NULL REFERENCES tramites.expediente (id) ON DELETE CASCADE,
    descripcion         text          NOT NULL,
    plazo_subsanar_en   date          NOT NULL,
    creada_por          uuid          NOT NULL,
    creada_en           timestamptz   NOT NULL DEFAULT now(),
    subsanada_en        timestamptz
);

-- Historia de cambios de estado: base del tablero de tiempos (RF19).
CREATE TABLE tramites.historial_estado (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expediente_id       uuid          NOT NULL REFERENCES tramites.expediente (id) ON DELETE CASCADE,
    estado_anterior     varchar(30),
    estado_nuevo        varchar(30)   NOT NULL,
    usuario_id          uuid,                                   -- NULL = el sistema
    comentario          text,
    ocurrido_en         timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX ix_historial_expediente ON tramites.historial_estado (expediente_id, ocurrido_en);

CREATE TABLE tramites.auditoria (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id          uuid          NOT NULL,
    accion              varchar(30)   NOT NULL CHECK (accion IN
                        ('CONFIRMAR_RIESGO', 'CORREGIR_RIESGO', 'APROBAR', 'OBSERVAR', 'DENEGAR', 'REGISTRAR_PRESENCIAL')),
    numero_expediente   varchar(20)   NOT NULL,
    detalle             jsonb,
    ocurrido_en         timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_tramites ON tramites.auditoria (numero_expediente, ocurrido_en);

-- -------------------------------------------------------------------------------------
-- PAGOS EN CAJA (RF05, RF11, RF12, RF24, RF25, ADR-004)
-- -------------------------------------------------------------------------------------

CREATE TABLE pagos.esquela (
    codigo              varchar(30)   PRIMARY KEY,              -- ESQ-EXP-2026-000001
    numero_expediente   varchar(20)   NOT NULL UNIQUE,          -- una sola esquela por expediente
    codigo_receta       varchar(10)   NOT NULL,
    concepto            varchar(200)  NOT NULL,
    monto               numeric(10,2) NOT NULL CHECK (monto > 0),   -- copiado del catálogo al generarla
    generada_en         timestamptz   NOT NULL DEFAULT now(),
    numero_recibo       varchar(30),                            -- NULL = pendiente de pago
    pagada_en           timestamptz,
    registrado_por      uuid,                                   -- cajero
    CHECK ((numero_recibo IS NULL) = (pagada_en IS NULL)),
    CHECK ((numero_recibo IS NULL) = (registrado_por IS NULL))
);
CREATE UNIQUE INDEX ux_esquela_recibo ON pagos.esquela (numero_recibo) WHERE numero_recibo IS NOT NULL;
CREATE INDEX ix_esquela_pagada_en ON pagos.esquela (pagada_en) WHERE pagada_en IS NOT NULL;

CREATE TABLE pagos.auditoria (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id          uuid          NOT NULL,
    accion              varchar(20)   NOT NULL CHECK (accion IN ('REGISTRAR_PAGO', 'CORREGIR_RECIBO')),
    codigo_esquela      varchar(30)   NOT NULL REFERENCES pagos.esquela (codigo),
    recibo_anterior     varchar(30),
    recibo_nuevo        varchar(30)   NOT NULL,
    motivo              text,
    ocurrido_en         timestamptz   NOT NULL DEFAULT now(),
    CHECK (accion <> 'CORREGIR_RECIBO' OR (motivo IS NOT NULL AND recibo_anterior IS NOT NULL))
);

-- -------------------------------------------------------------------------------------
-- INSPECCIONES ITSE (RF10, RF25)
-- -------------------------------------------------------------------------------------

CREATE TABLE inspecciones.inspeccion (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_expediente   varchar(20)   NOT NULL,
    tipo                varchar(15)   NOT NULL CHECK (tipo IN ('PREVIA', 'POSTERIOR', 'BODEGA')),
    inspector_id        uuid,                                   -- una inspección tiene un solo inspector
    programada_para     date,
    estado              varchar(15)   NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'ASIGNADA', 'REALIZADA')),
    resultado           varchar(15)   CHECK (resultado IN ('FAVORABLE', 'DESFAVORABLE')),
    observaciones       text,
    registrada_en       timestamptz,
    creada_en           timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (numero_expediente, tipo),
    CHECK ((estado = 'REALIZADA') = (resultado IS NOT NULL)),
    CHECK (estado = 'PENDIENTE' OR inspector_id IS NOT NULL)
);
CREATE INDEX ix_inspeccion_bandeja ON inspecciones.inspeccion (inspector_id, estado);

CREATE TABLE inspecciones.foto (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    inspeccion_id       uuid          NOT NULL REFERENCES inspecciones.inspeccion (id) ON DELETE CASCADE,
    clave_almacen       varchar(300)  NOT NULL UNIQUE,
    tipo_mime           varchar(80)   NOT NULL CHECK (tipo_mime IN ('image/jpeg', 'image/png')),
    tamano_bytes        integer       NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 10485760),
    tomada_en           timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE inspecciones.auditoria (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id          uuid          NOT NULL,
    accion              varchar(25)   NOT NULL CHECK (accion IN ('ASIGNAR_INSPECTOR', 'REGISTRAR_RESULTADO')),
    inspeccion_id       uuid          NOT NULL REFERENCES inspecciones.inspeccion (id),
    numero_expediente   varchar(20)   NOT NULL,
    detalle             jsonb,
    ocurrido_en         timestamptz   NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------------------
-- LICENCIAS (RF13, RF14, RF25)
-- -------------------------------------------------------------------------------------

CREATE SEQUENCE licencias.numero_licencia_seq;

CREATE TABLE licencias.licencia (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    numero              varchar(20)   NOT NULL UNIQUE,          -- LF-2026-000001
    numero_expediente   varchar(20)   NOT NULL,
    codigo_receta       varchar(10)   NOT NULL,
    tipo                varchar(12)   NOT NULL CHECK (tipo IN ('DEFINITIVA', 'PROVISIONAL')),
    -- Datos mínimos que se publican en la verificación del QR (ADR-007)
    nombre_comercial    varchar(200),
    giro                varchar(150)  NOT NULL,
    zona                varchar(60)   NOT NULL,
    titular_publico     varchar(200)  NOT NULL,                 -- razón social, o nombre con apellidos abreviados
    codigo_verificacion char(22)      NOT NULL UNIQUE,          -- token aleatorio del QR (no adivinable)
    emitida_en          timestamptz   NOT NULL DEFAULT now(),
    vigente_hasta       date,                                   -- NULL = vigencia indeterminada
    estado              varchar(12)   NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'REEMPLAZADA', 'VENCIDA')),
    reemplaza_a         uuid          REFERENCES licencias.licencia (id),   -- transferencia, cambio de giro, definitiva de bodega
    clave_pdf           varchar(300)
);
CREATE UNIQUE INDEX ux_licencia_vigente_por_expediente ON licencias.licencia (numero_expediente) WHERE estado = 'VIGENTE';

CREATE TABLE licencias.certificado_itse (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    licencia_id         uuid          NOT NULL REFERENCES licencias.licencia (id),
    numero              varchar(30)   NOT NULL UNIQUE,
    emitido_en          date          NOT NULL,
    vence_en            date          NOT NULL,                 -- se renueva cada 2 años
    aviso_enviado_en    timestamptz,                            -- RF14: un solo aviso antes del vencimiento
    CHECK (vence_en > emitido_en)
);
CREATE INDEX ix_itse_por_vencer ON licencias.certificado_itse (vence_en) WHERE aviso_enviado_en IS NULL;

CREATE TABLE licencias.auditoria (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id          uuid,                                   -- NULL = emisión automática (ruta A)
    accion              varchar(20)   NOT NULL CHECK (accion IN ('EMITIR', 'EMITIR_PROVISIONAL', 'REEMPLAZAR')),
    numero_licencia     varchar(20)   NOT NULL,
    numero_expediente   varchar(20)   NOT NULL,
    ocurrido_en         timestamptz   NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------------------
-- RELOJ DE PLAZOS (RF08, RF23, ADR-006, EQ-07)
-- -------------------------------------------------------------------------------------

CREATE TABLE plazos.feriado (
    fecha               date          PRIMARY KEY,
    descripcion         varchar(150)  NOT NULL,
    alcance             varchar(10)   NOT NULL CHECK (alcance IN ('NACIONAL', 'REGIONAL', 'LOCAL')),
    registrado_por      uuid          NOT NULL,
    registrado_en       timestamptz   NOT NULL DEFAULT now()
);

-- La restricción UNIQUE garantiza UNA sola alerta por expediente y vencimiento (EQ-07: ni cero ni duplicadas).
CREATE TABLE plazos.alerta (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_expediente   varchar(20)   NOT NULL,
    vence_en            date          NOT NULL,
    dias_habiles_restantes smallint   NOT NULL,
    generada_en         timestamptz   NOT NULL DEFAULT now(),
    atendida_en         timestamptz,
    UNIQUE (numero_expediente, vence_en)
);

-- -------------------------------------------------------------------------------------
-- NOTIFICACIONES (RF20)
-- -------------------------------------------------------------------------------------

CREATE TABLE notificaciones.mensaje (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    canal               varchar(6)    NOT NULL CHECK (canal IN ('CORREO', 'SMS')),
    destino_cifrado     bytea         NOT NULL,
    plantilla           varchar(40)   NOT NULL,                 -- CAMBIO_ESTADO, ESQUELA_GENERADA, LICENCIA_EMITIDA, ITSE_POR_VENCER, ALERTA_PLAZO
    datos               jsonb         NOT NULL,
    numero_expediente   varchar(20),
    estado              varchar(10)   NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'ENVIADO', 'FALLIDO')),
    intentos            smallint      NOT NULL DEFAULT 0,
    ultimo_error        text,
    creado_en           timestamptz   NOT NULL DEFAULT now(),
    enviado_en          timestamptz
);
CREATE INDEX ix_mensaje_pendiente ON notificaciones.mensaje (creado_en) WHERE estado = 'PENDIENTE';
