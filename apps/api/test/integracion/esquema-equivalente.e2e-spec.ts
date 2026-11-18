import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

// docs/05-modelo-de-datos/esquema.sql describe el estado ACTUAL del modelo y las migraciones de
// prisma/migrations/ son su historia (research.md de la 002, §R-15). Esta prueba crea una base
// temporal con esquema.sql + datos-semilla.sql y la compara con la base migrada de DATABASE_URL:
// columnas, restricciones e índices de los esquemas del sistema. Requiere un usuario con permiso
// para crear bases (el de Docker Compose y el del CI lo tienen).

process.env.DATABASE_URL ??=
  'postgresql://licencias:cambiar_en_produccion_solo_desarrollo@localhost:5432/licencias';

const ESQUEMAS = [
  'comun',
  'seguridad',
  'catalogo',
  'tramites',
  'pagos',
  'inspecciones',
  'licencias',
  'plazos',
  'notificaciones',
];

const raizRepo = join(__dirname, '..', '..', '..', '..');
const leerSql = (archivo: string): string =>
  readFileSync(join(raizRepo, 'docs', '05-modelo-de-datos', archivo), 'utf8');

const urlConBase = (url: string, base: string): string => {
  const destino = new URL(url);
  destino.pathname = `/${base}`;
  // Prisma agrega parámetros propios (p. ej. ?schema=) que pg no entiende.
  destino.search = '';
  return destino.toString();
};

interface Fila {
  readonly clave: string;
  readonly definicion: string;
}

const describirBase = async (cliente: Client): Promise<Map<string, string>> => {
  const columnas = await cliente.query<Fila>(
    `SELECT format('columna %s.%s.%s', table_schema, table_name, column_name) AS clave,
            format('%s nulable=%s default=%s', data_type, is_nullable, coalesce(column_default, '-'))
              AS definicion
       FROM information_schema.columns
      WHERE table_schema = ANY($1)`,
    [ESQUEMAS],
  );
  const restricciones = await cliente.query<Fila>(
    `SELECT format('restriccion %s.%s', c.conrelid::regclass, c.conname) AS clave,
            pg_get_constraintdef(c.oid) AS definicion
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = ANY($1)`,
    [ESQUEMAS],
  );
  const indices = await cliente.query<Fila>(
    `SELECT format('indice %s.%s', schemaname, indexname) AS clave, indexdef AS definicion
       FROM pg_indexes
      WHERE schemaname = ANY($1)`,
    [ESQUEMAS],
  );

  return new Map(
    [...columnas.rows, ...restricciones.rows, ...indices.rows].map((fila) => [
      fila.clave,
      fila.definicion,
    ]),
  );
};

const diferencias = (migrada: Map<string, string>, referencia: Map<string, string>): string[] => {
  const claves = new Set([...migrada.keys(), ...referencia.keys()]);
  return [...claves].sort().flatMap((clave) => {
    const enMigrada = migrada.get(clave);
    const enReferencia = referencia.get(clave);
    if (enMigrada === enReferencia) {
      return [];
    }
    return [
      `${clave}\n    migraciones: ${enMigrada ?? '(no existe)'}\n    esquema.sql: ${enReferencia ?? '(no existe)'}`,
    ];
  });
};

describe('docs/05-modelo-de-datos/esquema.sql equivale a las migraciones', () => {
  const urlMigrada = process.env.DATABASE_URL ?? '';
  const baseReferencia = `licencias_ref_${randomBytes(4).toString('hex')}`;
  const admin = new Client({ connectionString: urlConBase(urlMigrada, 'postgres') });
  const migrada = new Client({
    connectionString: urlConBase(urlMigrada, new URL(urlMigrada).pathname.slice(1)),
  });
  const referencia = new Client({ connectionString: urlConBase(urlMigrada, baseReferencia) });

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${baseReferencia}`);
    await referencia.connect();
    await referencia.query(leerSql('esquema.sql'));
    await referencia.query(leerSql('datos-semilla.sql'));
    await migrada.connect();
  }, 60000);

  afterAll(async () => {
    await referencia.end();
    await migrada.end();
    await admin.query(`DROP DATABASE IF EXISTS ${baseReferencia}`);
    await admin.end();
  });

  it('tiene las mismas columnas, restricciones e índices', async () => {
    const lista = diferencias(await describirBase(migrada), await describirBase(referencia));

    if (lista.length > 0) {
      throw new Error(
        `La base migrada y esquema.sql difieren en ${String(lista.length)} objeto(s). ` +
          `Actualice esquema.sql o cree una migración:\n  ${lista.join('\n  ')}`,
      );
    }
  });
});
