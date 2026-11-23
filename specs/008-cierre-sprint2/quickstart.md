# Guía de validación: 008

## En local (liviano)

1. `npm run lint`, `npm run typecheck`, `npm run formato` y `npm run cobertura -w apps/api`. Todo en
   verde, con dominio y aplicación ≥ 80 %.
2. Prueba de integración de Swagger, contra los contenedores temporales `pg-pruebas-008` (puerto 5433)
   y `redis-pruebas-008` (puerto 16379):
   - `npx jest --selectProjects integracion documentacion-api`;
   - comprueba `/api/docs` (200), que `/api/docs/openapi.json` es igual al YAML, la CSP de la
     documentación y que `/api/v1/salud` no la tiene.
3. `node tests/analisis/resumen-cobertura.mjs` imprime la tabla por módulo y capa que va al README.

## En GitHub Actions

1. `postman.yml` corre solo en el PR. El informe `newman` muestra todo en verde.
2. Lanzar `carga-sprint2.yml` a pedido y descargar `carga-sprint2` y `planes-bd`.
3. Copiar las cifras:
   - las etapas a `docs/08-sprint-2/atributos-de-calidad.md` (EQ-01 y EQ-02);
   - la caché a `docs/08-sprint-2/cache.md`;
   - los planes y las conexiones a `docs/08-sprint-2/base-de-datos.md`.

## Revisión de los documentos

- Cada archivo citado en `solid-y-patrones.md` existe y contiene la frase citada. Lo comprueba
  `tests/analisis/verificar-citas.mjs`.
- Cada enlace de `docs/08-sprint-2/README.md` apunta a un archivo que existe. Lo comprueba el mismo
  script.
