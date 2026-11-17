// Regla de dependencia del backend (constitución, principio I; research.md §R-12).
// Se ejecuta con `npm run regla-dependencia` y en el check `regla-dependencia` del CI.
//
// Las rutas aceptan dos raíces: el código real (`apps/api/src/`) y los archivos de ejemplo que
// violan cada regla (`apps/api/test/regla-dependencia/fixtures/src/`), que usa la prueba
// `apps/api/test/regla-dependencia/regla-dependencia.spec.ts`. Los grupos de la raíz no capturan,
// así `$1` sigue siendo el nombre del módulo en `aislamiento-entre-modulos`.
const { join } = require('node:path');

const RAIZ = '^(?:apps/api/test/regla-dependencia/fixtures/|apps/api/)src/';
const CAPA = (capa) => `${RAIZ}(?:modulos|operacion)/[^/]+/${capa}/`;

// Todo lo que no es código propio: paquetes npm (declarados o no) y módulos core de Node.
const EXTERNOS = [
  'npm',
  'npm-dev',
  'npm-optional',
  'npm-peer',
  'npm-bundled',
  'npm-no-pkg',
  'npm-unknown',
  'core',
];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'dominio-sin-externos',
      comment:
        'El dominio no importa paquetes npm ni módulos de Node (ni NestJS, ni Prisma, ni ioredis).',
      severity: 'error',
      from: { path: CAPA('dominio') },
      to: { dependencyTypes: EXTERNOS },
    },
    {
      name: 'dominio-sin-otras-capas',
      comment: 'El dominio no conoce aplicacion, infraestructura ni presentacion.',
      severity: 'error',
      from: { path: CAPA('dominio') },
      to: {
        path: `${RAIZ}(?:modulos|operacion)/[^/]+/(?:aplicacion|infraestructura|presentacion)/`,
      },
    },
    {
      name: 'aplicacion-hacia-dentro',
      comment:
        'La aplicación solo depende del dominio: nada de infraestructura, presentacion ni npm.',
      severity: 'error',
      from: { path: CAPA('aplicacion') },
      to: { path: `${RAIZ}(?:modulos|operacion)/[^/]+/(?:infraestructura|presentacion)/` },
    },
    {
      name: 'aplicacion-hacia-dentro',
      comment:
        'La aplicación solo depende del dominio: nada de infraestructura, presentacion ni npm.',
      severity: 'error',
      from: { path: CAPA('aplicacion') },
      to: { dependencyTypes: EXTERNOS },
    },
    {
      name: 'infraestructura-no-presentacion',
      comment: 'Los adaptadores de infraestructura no dependen de la capa de presentación.',
      severity: 'error',
      from: { path: CAPA('infraestructura') },
      to: { path: `${RAIZ}(?:modulos|operacion)/[^/]+/presentacion/` },
    },
    {
      name: 'aislamiento-entre-modulos',
      comment: 'Un módulo solo puede usar otro a través de su fachada.ts.',
      severity: 'error',
      from: { path: `${RAIZ}modulos/([^/]+)/` },
      to: {
        path: `${RAIZ}modulos/`,
        pathNot: [`${RAIZ}modulos/$1/`, `${RAIZ}modulos/[^/]+/fachada\\.ts$`],
      },
    },
    {
      name: 'sin-ciclos',
      comment: 'No se permiten dependencias circulares.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // La ejecución normal no recorre los ejemplos que violan las reglas a propósito. node_modules
    // va en doNotFollow y no aquí: excluirlo borraría las aristas hacia npm que evalúan las reglas.
    exclude: { path: 'apps/api/test/regla-dependencia/fixtures' },
    // Ruta absoluta: con una relativa, dependency-cruiser resuelve mal el `extends` del tsconfig.
    tsConfig: { fileName: join(__dirname, 'apps/api/tsconfig.json') },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
  },
};
