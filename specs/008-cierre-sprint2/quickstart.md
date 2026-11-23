# Guía de validación: 008

## En local (liviano)

1. `npm run lint`, `npm run typecheck`, `npm run formato` y `npm run cobertura -w apps/api`. Todo en
   verde, con dominio y aplicación ≥ 80 %.
2. Prueba unitaria de Swagger con un módulo Nest mínimo, sin base de datos:
   - `npx jest --selectProjects unit documentacion`;
   - comprueba `/api/docs` (200), que `/api/docs/openapi.json` es igual al YAML, la CSP de la
     documentación y que con `DOCS_API=false` responde 404.

   La prueba de integración con la aplicación completa (`documentacion-api.e2e-spec.ts`) corre en el
   job `pruebas` del CI.
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
