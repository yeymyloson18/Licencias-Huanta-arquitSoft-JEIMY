# Contrato: flujos de medición del Sprint 2 (008)

| Flujo | Disparador | Qué levanta | Artefactos | Falla si |
| --- | --- | --- | --- | --- |
| `ci.yml`, job `cobertura` (mismo nombre) | PR y push a `main` | Nada (unitarias) | `cobertura` con `apps/api/coverage` (HTML, lcov y json-summary) y `apps/web/coverage` | La cobertura de dominio o aplicación baja del 80 % (como hoy) |
| `postman.yml` | `pull_request` y `workflow_dispatch` | Compose de desarrollo | `newman` con el informe HTML (htmlextra) y el JUnit | Alguna petición del humo no da el código esperado |
| `carga-sprint2.yml`, job `carga` | `workflow_dispatch` (entrada opcional: `usuarios_max`, por defecto 2000) | Compose de desarrollo + `compose-carga.yml` con 2 réplicas | `carga-sprint2` con `resumen.json`, `informe.html`, `etapas.md`, `recursos.jsonl`, `cache-con.json`, `cache-sin.json` y `registros.txt` | El sistema no arranca o k6 no produce resumen. Superar los umbrales **no** lo hace fallar: se marca en el resumen del job |
| `carga-sprint2.yml`, job `planes-bd` | `workflow_dispatch` | Solo PostgreSQL de servicio y las migraciones | `planes-bd` con `planes.txt` | Falla la siembra o un `EXPLAIN` |

Ninguno de estos flujos usa secretos del repositorio. Los usuarios y las claves se generan en el
ejecutor con `sembrar-demostracion`. Los 5 checks obligatorios (`compilacion`, `pruebas`, `cobertura`,
`regla-dependencia` y `contrato`) no cambian de nombre.
