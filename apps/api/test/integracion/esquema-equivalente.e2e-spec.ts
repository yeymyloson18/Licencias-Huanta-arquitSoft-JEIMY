import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

// docs/05-modelo-de-datos/esquema.sql describe el estado ACTUAL del modelo y las migraciones de
// prisma/migrations/ son su historia (research.md de la 002, §R-15). Esta prueba crea una base
// temporal con esquema.sql + datos-semilla.sql y la compara con la base migrada de DATABASE_URL:
// columnas, restricciones e índices de los esquemas del sistema y, desde la 003, también los datos
// de las tablas de referencia (research.md §R-08 de la 003). Requiere un usuario con permiso para
// crear bases (el de Docker Compose y el del CI lo tienen).

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

// Tablas de referencia cuyos datos describe datos-semilla.sql. Se excluyen las columnas que cambian
// con el uso (identidades y quién/cuándo actualizó).
interface TablaReferencia {
  readonly tabla: string;
  readonly excluir: readonly string[];
  readonly orden: string;
}

const TABLAS_REFERENCIA: readonly TablaReferencia[] = [
  { tabla: 'seguridad.rol', excluir: [], orden: 'codigo' },
  { tabla: 'catalogo.receta', excluir: ['actualizada_por', 'actualizada_en'], orden: 'codigo' },
  { tabla: 'catalogo.requisito', excluir: ['id'], orden: 'codigo_receta, orden' },
  { tabla: 'catalogo.pregunta_asistente', excluir: [], orden: 'codigo' },
  { tabla: 'catalogo.regla_asistente', excluir: ['id'], orden: 'prioridad' },
  { tabla: 'plazos.feriado', excluir: ['registrado_en'], orden: 'fecha' },
];

/** Filas de la tabla como JSON normalizado (jsonb), en orden de su clave natural. */
const leerFilas = async (cliente: Client, { tabla, excluir, orden }: TablaReferencia) => {
  // `tabla` y `orden` son constantes de esta prueba, no entradas externas.
  const resultado = await cliente.query<{ fila: string }>(
    `SELECT (to_jsonb(t) - $1::text[])::text AS fila FROM ${tabla} t ORDER BY ${orden}`,
    [excluir],
  );
  return resultado.rows.map((registro) => registro.fila);
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

  it.each(TABLAS_REFERENCIA.map((tabla) => [tabla.tabla, tabla] as const))(
    'los datos de %s coinciden con datos-semilla.sql',
    async (nombre, tabla) => {
      const filasMigradas = await leerFilas(migrada, tabla);
      const filasReferencia = await leerFilas(referencia, tabla);

      const total = Math.max(filasMigradas.length, filasReferencia.length);
      for (let indice = 0; indice < total; indice += 1) {
        if (filasMigradas[indice] !== filasReferencia[indice]) {
          throw new Error(
            `Los datos de ${nombre} difieren de datos-semilla.sql en la fila ${String(indice + 1)}. ` +
              'Actualice datos-semilla.sql o cree una migración:\n' +
              `    migraciones:       ${filasMigradas[indice] ?? '(no existe)'}\n` +
              `    datos-semilla.sql: ${filasReferencia[indice] ?? '(no existe)'}`,
          );
        }
      }
    },
  );
});
