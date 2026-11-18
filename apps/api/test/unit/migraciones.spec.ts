import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Control de las migraciones versionadas (research.md §R-15 de la 002 y §R-08 de la 003):
// - Las migraciones ya aplicadas en todos los entornos se congelan con su SHA-256: 0001 (esquema
//   inicial) y 0002 (datos semilla iniciales). Los cambios van en migraciones nuevas.
// - docs/05-modelo-de-datos/esquema.sql y datos-semilla.sql describen el estado ACTUAL; su
//   equivalencia con las migraciones (estructura y datos de referencia) la verifica la prueba de
//   integración esquema-equivalente.e2e-spec.ts.
const raizApi = join(__dirname, '..', '..');

const leerNormalizado = (ruta: string): string => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');

const huellaDe = (migracion: string): string =>
  createHash('sha256')
    .update(leerNormalizado(join(raizApi, 'prisma/migrations', migracion, 'migration.sql')))
    .digest('hex');

describe('Migraciones versionadas', () => {
  it('0001_esquema_inicial no cambió (ya está aplicada)', () => {
    if (
      huellaDe('0001_esquema_inicial') !==
      'ef535126ebd7a61c3da5f92b43d7509424bb2a3505ef27debee3cbd6ece5a06b'
    ) {
      throw new Error(
        '0001 ya está aplicada: no se edita; cree una migración nueva y actualice ' +
          'docs/05-modelo-de-datos/esquema.sql.',
      );
    }
  });

  it('0002_datos_semilla no cambió (ya está aplicada)', () => {
    if (
      huellaDe('0002_datos_semilla') !==
      '199c574f5d60a73f9f7afdca1a9cf31210916e49b104d1f94bbf0b9ef443ad50'
    ) {
      throw new Error(
        '0002 ya está aplicada: no se edita; cree una migración nueva y actualice ' +
          'docs/05-modelo-de-datos/datos-semilla.sql.',
      );
    }
  });
});
