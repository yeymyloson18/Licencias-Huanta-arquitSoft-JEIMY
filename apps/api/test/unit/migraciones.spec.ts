import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Control de las migraciones versionadas (research.md de la 002, §R-15):
// - 0001 ya está aplicada en todos los entornos: se congela con su SHA-256. docs/05-modelo-de-datos/
//   esquema.sql ahora describe el estado ACTUAL, y su equivalencia con las migraciones la verifica la
//   prueba de integración esquema-equivalente.e2e-spec.ts.
// - 0002 sigue siendo copia literal de datos-semilla.sql.
const raizApi = join(__dirname, '..', '..');
const raizRepo = join(raizApi, '..', '..');

const leerNormalizado = (ruta: string): string => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');

const SHA256_0001 = 'ef535126ebd7a61c3da5f92b43d7509424bb2a3505ef27debee3cbd6ece5a06b';

describe('Migraciones versionadas', () => {
  it('0001_esquema_inicial no cambió (ya está aplicada)', () => {
    const contenido = leerNormalizado(
      join(raizApi, 'prisma/migrations/0001_esquema_inicial/migration.sql'),
    );
    const huella = createHash('sha256').update(contenido).digest('hex');

    if (huella !== SHA256_0001) {
      throw new Error(
        '0001 ya está aplicada: no se edita; cree una migración nueva y actualice ' +
          'docs/05-modelo-de-datos/esquema.sql.',
      );
    }
  });

  it('0002_datos_semilla coincide con docs/05-modelo-de-datos/datos-semilla.sql', () => {
    const migracion = leerNormalizado(
      join(raizApi, 'prisma/migrations/0002_datos_semilla/migration.sql'),
    );
    const documento = leerNormalizado(join(raizRepo, 'docs/05-modelo-de-datos/datos-semilla.sql'));

    if (migracion !== documento) {
      throw new Error(
        'La migración 0002_datos_semilla no coincide con datos-semilla.sql. ' +
          'Copie el archivo de docs/ a la migración (o viceversa) en el mismo PR.',
      );
    }
  });
});
