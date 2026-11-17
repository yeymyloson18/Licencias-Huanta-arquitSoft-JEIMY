import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Las migraciones son copias literales de docs/05-modelo-de-datos/ (research.md §R-03).
// Si alguien cambia una sin la otra, esta prueba falla e indica cuál difiere.
const raizApi = join(__dirname, '..', '..');
const raizRepo = join(raizApi, '..', '..');

const pares = [
  {
    migracion: 'prisma/migrations/0001_esquema_inicial/migration.sql',
    documento: 'docs/05-modelo-de-datos/esquema.sql',
  },
  {
    migracion: 'prisma/migrations/0002_datos_semilla/migration.sql',
    documento: 'docs/05-modelo-de-datos/datos-semilla.sql',
  },
];

const leerNormalizado = (ruta: string): string => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');

describe('Migraciones versionadas', () => {
  it.each(pares)('$migracion coincide con $documento', ({ migracion, documento }) => {
    const contenidoMigracion = leerNormalizado(join(raizApi, migracion));
    const contenidoDocumento = leerNormalizado(join(raizRepo, documento));

    if (contenidoMigracion !== contenidoDocumento) {
      throw new Error(
        `La migración ${migracion} no coincide con ${documento}. ` +
          'Copie el archivo de docs/ a la migración (o viceversa) en el mismo PR.',
      );
    }
  });
});
