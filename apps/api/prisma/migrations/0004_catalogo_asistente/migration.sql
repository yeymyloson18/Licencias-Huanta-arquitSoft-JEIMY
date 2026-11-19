-- =====================================================================================
-- Migración 0004: catálogo y asistente de ruta (funcionalidad 003)
-- Detalle: specs/003-catalogo-asistente/data-model.md §1. El estado resultante está descrito en
-- docs/05-modelo-de-datos/esquema.sql y datos-semilla.sql, y la prueba esquema-equivalente.e2e-spec.ts
-- verifica que coinciden (research.md §R-08 de la 003). Las migraciones 0001 a 0003 ya están
-- aplicadas: no se editan.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- cambio_receta: registro inmutable de cada modificación de una receta (FR-021 a FR-023,
-- research §R-05). La FK hacia receta es válida porque está en el mismo esquema; usuario_id es una
-- referencia lógica a seguridad.usuario, sin FK (MD2). La aplicación nunca hace UPDATE ni DELETE.
-- -------------------------------------------------------------------------------------
CREATE TABLE catalogo.cambio_receta (
    id                  bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_receta       varchar(10)   NOT NULL REFERENCES catalogo.receta (codigo),
    usuario_id          uuid          NOT NULL,             -- ref. lógica a seguridad.usuario (sin FK)
    cambiado_en         timestamptz   NOT NULL DEFAULT now(),
    cambios             jsonb         NOT NULL               -- {"tasa":{"antes":"177.10","despues":"180.00"}}
                        CHECK (jsonb_typeof(cambios) = 'object' AND cambios <> '{}'::jsonb)
);
CREATE INDEX ix_cambio_receta_receta ON catalogo.cambio_receta (codigo_receta, cambiado_en);

-- -------------------------------------------------------------------------------------
-- requisito: el orden único se verifica al confirmar la transacción, para poder reordenar los
-- requisitos de una receta sin chocar fila por fila (FR-020, research §R-04). Se conserva el
-- nombre de la restricción.
-- -------------------------------------------------------------------------------------
ALTER TABLE catalogo.requisito DROP CONSTRAINT requisito_codigo_receta_orden_key;
ALTER TABLE catalogo.requisito
    ADD CONSTRAINT requisito_codigo_receta_orden_key UNIQUE (codigo_receta, orden)
    DEFERRABLE INITIALLY DEFERRED;

-- -------------------------------------------------------------------------------------
-- Asistente: opción "No lo sé" en la pregunta del nivel de riesgo (aclaración 2 de la 003).
-- Ninguna regla la usa, así que el asistente responde "no se pudo determinar" salvo que una regla
-- de mayor prioridad ya coincida (bodega o corporativo).
-- -------------------------------------------------------------------------------------
UPDATE catalogo.pregunta_asistente
SET opciones = opciones || '[{"valor":"NO_SE","texto":"No lo sé"}]'::jsonb
WHERE codigo = 'NIVEL_RIESGO';
