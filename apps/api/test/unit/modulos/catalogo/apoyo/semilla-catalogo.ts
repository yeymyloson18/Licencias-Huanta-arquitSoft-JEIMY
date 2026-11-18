import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DatosAsistente,
  OpcionPregunta,
} from '../../../../../src/modulos/catalogo/dominio/pregunta-asistente';
import type { DatosRecetaCompleta } from '../../../../../src/modulos/catalogo/dominio/receta-completa';
import type { DatosRequisito } from '../../../../../src/modulos/catalogo/dominio/requisito';

// Lee las recetas y requisitos de docs/05-modelo-de-datos/datos-semilla.sql para que las pruebas
// unitarias usen los mismos datos que la base (sin copiarlos a mano). Solo entiende la forma de los
// INSERT de ese archivo; si cambia su forma, esta función falla con un mensaje claro.

type Valor = string | number | boolean | null;

const RUTA_SEMILLA = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'docs',
  '05-modelo-de-datos',
  'datos-semilla.sql',
);

const convertir = (texto: string): Valor => {
  const limpio = texto.trim();
  if (limpio === 'NULL') return null;
  if (limpio === 'true') return true;
  if (limpio === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(limpio)) return Number(limpio);
  throw new Error(`Valor SQL no reconocido en datos-semilla.sql: ${limpio}`);
};

/** Tuplas `( … )` de primer nivel de un bloque VALUES, respetando las comillas simples. */
const leerTuplas = (bloque: string): Valor[][] => {
  const tuplas: Valor[][] = [];
  let actual: Valor[] | null = null;
  let token = '';
  let enTexto = false;
  let fueTexto = false;
  let profundidad = 0;

  for (let i = 0; i < bloque.length; i += 1) {
    const caracter = bloque.charAt(i);
    if (enTexto) {
      if (caracter === "'" && bloque.charAt(i + 1) === "'") {
        token += "'";
        i += 1;
      } else if (caracter === "'") {
        enTexto = false;
      } else {
        token += caracter;
      }
      continue;
    }
    if (caracter === "'") {
      // Descarta los espacios entre la coma y la comilla de apertura.
      token = '';
      enTexto = true;
      fueTexto = true;
    } else if (caracter === '(') {
      profundidad += 1;
      if (profundidad === 1) {
        actual = [];
        token = '';
        fueTexto = false;
      }
    } else if (caracter === ',' && profundidad === 1 && actual) {
      actual.push(fueTexto ? token : convertir(token));
      token = '';
      fueTexto = false;
    } else if (caracter === ')') {
      if (profundidad === 1 && actual) {
        actual.push(fueTexto ? token : convertir(token));
        tuplas.push(actual);
        actual = null;
      }
      profundidad -= 1;
    } else if (profundidad >= 1) {
      token += caracter;
    }
  }
  return tuplas;
};

const comoTexto = (valor: Valor | undefined, campo: string): string => {
  if (typeof valor !== 'string') throw new Error(`${campo} no es texto en datos-semilla.sql`);
  return valor;
};
const comoNumeroONulo = (valor: Valor | undefined): number | null =>
  typeof valor === 'number' ? valor : null;

export const leerSemillaCatalogo = (): DatosRecetaCompleta[] => {
  const sql = readFileSync(RUTA_SEMILLA, 'utf8').replace(/\r\n/g, '\n');
  const requisitos = new Map<string, DatosRequisito[]>();
  const agregar = (codigo: string, orden: number, descripcion: string, condicion: string) => {
    const lista = requisitos.get(codigo) ?? [];
    lista.push({ id: null, orden, descripcion, obligatorio: true, condicion });
    requisitos.set(codigo, lista);
  };

  for (const [, valores, codigos] of sql.matchAll(
    /CROSS JOIN \(VALUES([\s\S]*?)\) AS v\(orden, descripcion, condicion\)\s*WHERE r\.codigo IN \(([^)]*)\);/g,
  )) {
    const lista = leerTuplas(valores ?? '');
    for (const codigo of (codigos ?? '').split(',').map((c) => c.trim().replace(/'/g, ''))) {
      for (const [orden, descripcion, condicion] of lista) {
        agregar(
          codigo,
          Number(orden),
          comoTexto(descripcion, 'descripcion'),
          comoTexto(condicion, 'condicion'),
        );
      }
    }
  }
  for (const [, valores] of sql.matchAll(
    /INSERT INTO catalogo\.requisito \(codigo_receta, orden, descripcion, condicion\) VALUES([\s\S]*?\));/g,
  )) {
    for (const [codigo, orden, descripcion, condicion] of leerTuplas(valores ?? '')) {
      agregar(
        comoTexto(codigo, 'codigo_receta'),
        Number(orden),
        comoTexto(descripcion, 'descripcion'),
        comoTexto(condicion, 'condicion'),
      );
    }
  }

  const recetas: DatosRecetaCompleta[] = [];
  for (const [, columnas, valores] of sql.matchAll(
    /INSERT INTO catalogo\.receta\s*\(([^)]*)\)\s*VALUES([\s\S]*?\));/g,
  )) {
    const nombres = (columnas ?? '').split(',').map((c) => c.trim());
    for (const tupla of leerTuplas(valores ?? '')) {
      const fila = new Map(nombres.map((nombre, indice) => [nombre, tupla[indice]]));
      const codigo = comoTexto(fila.get('codigo'), 'codigo');
      const tasa = fila.get('tasa');
      recetas.push({
        codigo,
        nombre: comoTexto(fila.get('nombre'), 'nombre'),
        tipo: comoTexto(fila.get('tipo'), 'tipo') as DatosRecetaCompleta['tipo'],
        ruta: (fila.get('ruta') ?? null) as DatosRecetaCompleta['ruta'],
        codigoTupa: comoTexto(fila.get('codigo_tupa'), 'codigo_tupa'),
        paginaTupa: Number(fila.get('pagina_tupa')),
        nivelRiesgo: (fila.get('nivel_riesgo') ?? null) as string | null,
        tasa: Number(tasa).toFixed(2),
        plazoDias: comoNumeroONulo(fila.get('plazo_dias')),
        tipoPlazo: (fila.get('tipo_plazo') ?? 'HABILES') as string,
        calificacion: comoTexto(fila.get('calificacion'), 'calificacion'),
        ordenItse: (fila.get('orden_itse') ?? null) as string | null,
        plazoItseDias: comoNumeroONulo(fila.get('plazo_itse_dias')),
        vigenciaMeses: comoNumeroONulo(fila.get('vigencia_meses')),
        activa: true,
        requisitos: requisitos.get(codigo) ?? [],
        actualizadaEn: '2026-11-18T00:00:00.000Z',
      });
    }
  }

  if (recetas.length !== 12) {
    throw new Error(
      `Se esperaban 12 recetas en datos-semilla.sql y se leyeron ${String(recetas.length)}`,
    );
  }
  return recetas;
};

/** Preguntas y reglas del asistente tal como las deja datos-semilla.sql (FR-002, SC-002). */
export const leerSemillaAsistente = (): DatosAsistente => {
  const sql = readFileSync(RUTA_SEMILLA, 'utf8').replace(/\r\n/g, '\n');

  const bloquePreguntas =
    /INSERT INTO catalogo\.pregunta_asistente \(codigo, orden, texto, opciones\) VALUES([\s\S]*?\]'\));/.exec(
      sql,
    )?.[1];
  const bloqueReglas =
    /INSERT INTO catalogo\.regla_asistente \(prioridad, condiciones, codigo_receta\) VALUES([\s\S]*?\));/.exec(
      sql,
    )?.[1];
  if (bloquePreguntas === undefined || bloqueReglas === undefined) {
    throw new Error(
      'No se encontraron las preguntas o las reglas del asistente en datos-semilla.sql',
    );
  }

  const preguntas = leerTuplas(bloquePreguntas).map(([codigo, orden, texto, opciones]) => ({
    codigo: comoTexto(codigo, 'codigo'),
    orden: Number(orden),
    texto: comoTexto(texto, 'texto'),
    opciones: JSON.parse(comoTexto(opciones, 'opciones')) as OpcionPregunta[],
  }));
  const reglas = leerTuplas(bloqueReglas).map(([prioridad, condiciones, codigoReceta]) => ({
    prioridad: Number(prioridad),
    condiciones: JSON.parse(comoTexto(condiciones, 'condiciones')) as Record<string, string>,
    codigoReceta: comoTexto(codigoReceta, 'codigo_receta'),
  }));

  if (preguntas.length === 0 || reglas.length === 0) {
    throw new Error('datos-semilla.sql no tiene preguntas o reglas del asistente');
  }
  return { preguntas, reglas };
};
