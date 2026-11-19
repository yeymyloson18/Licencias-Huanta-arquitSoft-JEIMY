-- =====================================================================================
-- Migración 0005: requisitos de los trámites conectados (funcionalidad 003, historia 3)
-- Fuente: docs/01-analisis-de-sistema/09-validacion-del-tupa.md, "Fichas de los trámites conectados"
-- (TUPA págs. 384, 390 y 499). La semilla 0002 los dejó sin requisitos y FR-019 no permite guardar
-- una receta sin requisitos: sin esta migración, el administrador no podría editar estos trámites.
-- El estado resultante está en docs/05-modelo-de-datos/datos-semilla.sql. Las migraciones 0001 a
-- 0004 ya están aplicadas: no se editan.
-- =====================================================================================

INSERT INTO catalogo.requisito (codigo_receta, orden, descripcion, condicion) VALUES
    ('TRF-01', 1, 'Declaración jurada', 'SIEMPRE'),
    ('TRF-01', 2, 'Copia del contrato de transferencia', 'SIEMPRE'),
    ('CGI-01', 1, 'Declaración jurada', 'SIEMPRE'),
    ('DUP-01', 1, 'Solicitud con el número del certificado de licencia', 'SIEMPRE'),
    ('DUP-01', 2, 'Fecha y número de la constancia de pago', 'SIEMPRE');
