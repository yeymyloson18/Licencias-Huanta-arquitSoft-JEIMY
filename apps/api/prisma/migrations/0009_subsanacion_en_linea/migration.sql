-- 005, historia 4: el titular subsana en línea con su identidad confirmada, sin usuario del personal.
-- La auditoría admite usuario_id nulo también para SUBSANAR (además de PRESENTAR_EN_LINEA).
-- Se conserva el nombre de la restricción.
ALTER TABLE tramites.auditoria DROP CONSTRAINT auditoria_usuario_check;
ALTER TABLE tramites.auditoria
    ADD CONSTRAINT auditoria_usuario_check
        CHECK (accion IN ('PRESENTAR_EN_LINEA', 'SUBSANAR') OR usuario_id IS NOT NULL);
