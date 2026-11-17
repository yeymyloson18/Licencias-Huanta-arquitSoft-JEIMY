// Ejecuta `cruise()` de dependency-cruiser con las reglas de `.dependency-cruiser.cjs` sobre los
// archivos de ejemplo e imprime las violaciones en JSON por la salida estándar.
// Es un script aparte porque dependency-cruiser solo se publica como ESM y Jest corre en CommonJS;
// lo invoca `regla-dependencia.spec.ts`.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cruise } from 'dependency-cruiser';

const raizRepositorio = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
process.chdir(raizRepositorio);

const require = createRequire(import.meta.url);
const configuracion = require(resolve(raizRepositorio, '.dependency-cruiser.cjs'));

const resultado = await cruise(['apps/api/test/regla-dependencia/fixtures/src'], {
  ...configuracion.options,
  // Aquí sí se recorren los ejemplos (la ejecución normal los excluye).
  exclude: undefined,
  validate: true,
  ruleSet: { forbidden: configuracion.forbidden },
  outputType: 'json',
});

const salida =
  typeof resultado.output === 'string' ? JSON.parse(resultado.output) : resultado.output;

process.stdout.write(
  JSON.stringify(
    salida.summary.violations.map((violacion) => ({
      regla: violacion.rule.name,
      desde: violacion.from,
      hacia: violacion.to,
    })),
  ),
);
