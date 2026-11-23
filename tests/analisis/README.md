# Análisis del Sprint 2 (008)

Scripts reproducibles para las evidencias de `docs/08-sprint-2/`:

- `sembrar-10000.sql` y `planes-consultas.sql`: 10,000 expedientes ficticios y `EXPLAIN (ANALYZE,
BUFFERS)` de las consultas críticas. Corren en el job `planes-bd` de
  `.github/workflows/carga-sprint2.yml` (PostgreSQL efímero del ejecutor), no en local.
- `resumen-cobertura.mjs`: tabla de cobertura por módulo y capa a partir de `coverage-summary.json`.
- `verificar-citas.mjs`: comprueba que los archivos y frases citados en `docs/08-sprint-2/` existen.
