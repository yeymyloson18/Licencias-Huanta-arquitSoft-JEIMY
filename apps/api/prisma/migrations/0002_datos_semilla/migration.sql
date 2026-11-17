-- =====================================================================================
-- Datos semilla: roles y catálogo de recetas del TUPA 2024
-- Fuente: docs/01-analisis-de-sistema/09-validacion-del-tupa.md (páginas impresas del TUPA)
-- Se ejecuta después de esquema.sql.
-- =====================================================================================

INSERT INTO seguridad.rol (codigo, nombre) VALUES
    ('MESA_PARTES',   'Mesa de partes'),
    ('EVALUADOR',     'Evaluador'),
    ('INSPECTOR',     'Inspector ITSE'),
    ('CAJA',          'Personal de caja'),
    ('JEFATURA',      'Jefatura'),
    ('ADMINISTRADOR', 'Administrador del sistema');

-- Las 9 licencias (ADR-002: un motor, nueve recetas)
INSERT INTO catalogo.receta
    (codigo, nombre, tipo, codigo_tupa, pagina_tupa, ruta, nivel_riesgo, es_cesionario, es_corporativa,
     tasa, plazo_dias, tipo_plazo, calificacion, orden_itse, plazo_itse_dias, vigencia_meses)
VALUES
    ('LIC-01', 'Licencia de funcionamiento – riesgo bajo',              'LICENCIA', 'PE1027344C1', 368, 'A', 'BAJO',     false, false, 159.50, 2, 'HABILES', 'APROBACION_AUTOMATICA',               'POSTERIOR',      9, NULL),
    ('LIC-02', 'Licencia de funcionamiento – riesgo medio',             'LICENCIA', 'PE102730761', 370, 'A', 'MEDIO',    false, false, 177.10, 2, 'HABILES', 'APROBACION_AUTOMATICA',               'POSTERIOR',      9, NULL),
    ('LIC-03', 'Licencia de funcionamiento – riesgo alto',              'LICENCIA', 'PE102735B77', 372, 'B', 'ALTO',     false, false, 305.90, 8, 'HABILES', 'EVALUACION_PREVIA_SILENCIO_POSITIVO', 'PREVIA',         7, NULL),
    ('LIC-04', 'Licencia de funcionamiento – riesgo muy alto',          'LICENCIA', 'PE102735FC9', 374, 'B', 'MUY_ALTO', false, false, 538.90, 8, 'HABILES', 'EVALUACION_PREVIA_SILENCIO_POSITIVO', 'PREVIA',         7, NULL),
    ('LIC-05', 'Licencia corporativa (mercados, galerías y centros comerciales)', 'LICENCIA', 'PE102738869', 376, 'B', NULL, false, true, 529.20, 8, 'HABILES', 'EVALUACION_PREVIA_SILENCIO_POSITIVO', 'PREVIA', 7, NULL),
    ('LIC-06', 'Licencia para cesionarios – riesgo medio',              'LICENCIA', 'PE102734ABB', 378, 'A', 'MEDIO',    true,  false, 180.40, 2, 'HABILES', 'APROBACION_AUTOMATICA',               'POSTERIOR',      9, NULL),
    ('LIC-07', 'Licencia para cesionarios – riesgo alto',               'LICENCIA', 'PE10273750E', 380, 'B', 'ALTO',     true,  false, 309.20, 8, 'HABILES', 'EVALUACION_PREVIA_SILENCIO_POSITIVO', 'PREVIA',         7, NULL),
    ('LIC-08', 'Licencia para cesionarios – riesgo muy alto',           'LICENCIA', 'PE10273BF60', 382, 'B', 'MUY_ALTO', true,  false, 542.20, 8, 'HABILES', 'EVALUACION_PREVIA_SILENCIO_POSITIVO', 'PREVIA',         7, NULL),
    ('LIC-09', 'Licencia provisional para bodegas',                     'LICENCIA', 'PE102739212', 388, 'C', 'BAJO',     false, false,   0.00, 5, 'HABILES', 'APROBACION_AUTOMATICA',               'DENTRO_6_MESES', NULL, 12);

-- Trámites conectados (RF15)
INSERT INTO catalogo.receta
    (codigo, nombre, tipo, codigo_tupa, pagina_tupa, tasa, plazo_dias, calificacion)
VALUES
    ('TRF-01', 'Transferencia de licencia o cambio de denominación', 'TRAMITE_CONECTADO', 'PE10273B979', 384, 45.10, NULL, 'APROBACION_AUTOMATICA'),
    ('CGI-01', 'Cambio de giro',                                     'TRAMITE_CONECTADO', 'PE1027380A2', 390, 46.20, NULL, 'APROBACION_AUTOMATICA'),
    ('DUP-01', 'Duplicado del certificado de licencia',              'TRAMITE_CONECTADO', 'SE6450ABA0',  499, 41.40, 3,    'SERVICIO_EXCLUSIVO');

-- Requisitos comunes (grupo ITSE posterior: LIC-01, LIC-02, LIC-06)
INSERT INTO catalogo.requisito (codigo_receta, orden, descripcion, condicion)
SELECT r.codigo, v.orden, v.descripcion, v.condicion
FROM catalogo.receta r
CROSS JOIN (VALUES
    (1, 'Solicitud con declaración jurada (RUC y DNI o carné de extranjería; del representante legal si es persona jurídica)', 'SIEMPRE'),
    (2, 'Declaración jurada de vigencia de poder (SUNARP) o carta poder', 'CON_REPRESENTANTE'),
    (3, 'Declaración jurada de condiciones de seguridad', 'SIEMPRE'),
    (4, 'Requisitos especiales según el giro (salud, autorización sectorial, patrimonio cultural)', 'GIRO_ESPECIAL')
) AS v(orden, descripcion, condicion)
WHERE r.codigo IN ('LIC-01', 'LIC-02', 'LIC-06');

-- Requisitos del grupo ITSE previa: LIC-03, LIC-04, LIC-05, LIC-07, LIC-08
INSERT INTO catalogo.requisito (codigo_receta, orden, descripcion, condicion)
SELECT r.codigo, v.orden, v.descripcion, v.condicion
FROM catalogo.receta r
CROSS JOIN (VALUES
    (1, 'Solicitud con declaración jurada (RUC y DNI o carné de extranjería; del representante legal si es persona jurídica)', 'SIEMPRE'),
    (2, 'Declaración jurada de vigencia de poder (SUNARP) o carta poder', 'CON_REPRESENTANTE'),
    (3, 'Croquis de ubicación', 'SIN_PLANOS_VIGENTES'),
    (4, 'Plano de arquitectura y cálculo de aforo', 'SIN_PLANOS_VIGENTES'),
    (5, 'Plano de tableros eléctricos, diagramas unifilares y cuadro de cargas', 'SIN_PLANOS_VIGENTES'),
    (6, 'Certificado de puesta a tierra', 'SIEMPRE'),
    (7, 'Plan de seguridad', 'SIEMPRE'),
    (8, 'Protocolos de los equipos contra incendio', 'SIEMPRE'),
    (9, 'Requisitos especiales según el giro', 'GIRO_ESPECIAL')
) AS v(orden, descripcion, condicion)
WHERE r.codigo IN ('LIC-03', 'LIC-04', 'LIC-05', 'LIC-07', 'LIC-08');

-- Requisitos de la bodega: LIC-09
INSERT INTO catalogo.requisito (codigo_receta, orden, descripcion, condicion) VALUES
    ('LIC-09', 1, 'Solicitud de licencia provisional con declaración jurada', 'SIEMPRE'),
    ('LIC-09', 2, 'Declaración jurada de condiciones de seguridad de la bodega', 'SIEMPRE');

-- Asistente de 3 preguntas (RF01). Pendiente de validar con la Municipalidad (duda N.° 2 del doc. 09).
INSERT INTO catalogo.pregunta_asistente (codigo, orden, texto, opciones) VALUES
    ('TIPO_ESTABLECIMIENTO', 1, '¿Qué tipo de establecimiento vas a abrir?',
     '[{"valor":"BODEGA","texto":"Bodega de hasta 50 m² en mi vivienda"},
       {"valor":"CORPORATIVO","texto":"Mercado, galería o centro comercial"},
       {"valor":"OTRO","texto":"Otro negocio"}]'),
    ('ES_CESIONARIO', 2, '¿Funcionarás dentro de un local que ya tiene licencia (cesionario)?',
     '[{"valor":"SI","texto":"Sí"},{"valor":"NO","texto":"No"}]'),
    ('NIVEL_RIESGO', 3, '¿Qué nivel de riesgo tiene tu actividad según la matriz de riesgo?',
     '[{"valor":"BAJO","texto":"Bajo"},{"valor":"MEDIO","texto":"Medio"},
       {"valor":"ALTO","texto":"Alto"},{"valor":"MUY_ALTO","texto":"Muy alto"}]');

INSERT INTO catalogo.regla_asistente (prioridad, condiciones, codigo_receta) VALUES
    (10, '{"TIPO_ESTABLECIMIENTO":"BODEGA"}',                                    'LIC-09'),
    (20, '{"TIPO_ESTABLECIMIENTO":"CORPORATIVO"}',                               'LIC-05'),
    (30, '{"ES_CESIONARIO":"SI","NIVEL_RIESGO":"MEDIO"}',                        'LIC-06'),
    (31, '{"ES_CESIONARIO":"SI","NIVEL_RIESGO":"ALTO"}',                         'LIC-07'),
    (32, '{"ES_CESIONARIO":"SI","NIVEL_RIESGO":"MUY_ALTO"}',                     'LIC-08'),
    (40, '{"NIVEL_RIESGO":"BAJO"}',                                              'LIC-01'),
    (41, '{"NIVEL_RIESGO":"MEDIO"}',                                             'LIC-02'),
    (42, '{"NIVEL_RIESGO":"ALTO"}',                                              'LIC-03'),
    (43, '{"NIVEL_RIESGO":"MUY_ALTO"}',                                          'LIC-04');
