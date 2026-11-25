import { clavePlazo, extraerCifras, normalizar, normalizarMonto } from './cifras';
import type { TurnoConversacion } from './pregunta-orientacion';
import type { LicenciaVigente, TemaGuia } from './puertos';
import { expandirSinonimos } from './sinonimos';

// Selección del contexto que se envía al proveedor (012, research R-04). Siempre van todas las
// licencias vigentes en una tabla compacta; según la pregunta (y las anteriores de la conversación),
// hasta 2 recetas con sus requisitos y hasta 4 temas de la guía, por coincidencia de palabras. Así se
// cuida la cuota del nivel gratuito y se prueba sin red.
//
// Corrección de la 012 (FR-027 y FR-028): también cuentan las licencias que el chat ya nombró en sus
// respuestas anteriores (la más reciente primero) y los sinónimos en español sencillo.

export const MAXIMO_RECETAS_DETALLE = 2;
export const MAXIMO_TEMAS = 4;
const TEMAS_GENERALES = ['rutas', 'presentar', 'consultar'];

export interface ContextoOrientacion {
  readonly licencias: readonly LicenciaVigente[];
  readonly detalle: readonly LicenciaVigente[];
  readonly temas: readonly TemaGuia[];
  /** El tema que más coincide; `null` si la pregunta no coincide con ninguno. */
  readonly temaPrincipal: TemaGuia | null;
  /** Montos y plazos que una respuesta puede mencionar (research R-06). */
  readonly cifrasPermitidas: ReadonlySet<string>;
  /** La pregunta actual pide requisitos o documentos (FR-029). */
  readonly pideRequisitos: boolean;
}

/** Turno de la conversación tal como lo usa la selección (sin datos personales). */
export type TurnoContexto = Pick<TurnoConversacion, 'rol' | 'texto' | 'codigosReceta'>;

/** Palabras que no ayudan a elegir: artículos, preguntas y las que tienen todas las licencias. */
const VACIAS = new Set([
  'a',
  'al',
  'como',
  'con',
  'cual',
  'cuales',
  'cuanto',
  'cuanta',
  'de',
  'del',
  'el',
  'en',
  'es',
  'funcionamiento',
  'hay',
  'la',
  'las',
  'le',
  'licencia',
  'lo',
  'los',
  'me',
  'mi',
  'o',
  'para',
  'por',
  'que',
  'quiero',
  'riesgo',
  'se',
  'si',
  'su',
  'tengo',
  'un',
  'una',
  'y',
]);

/** Singular sencillo: "bodegas" → "bodega", "cesionarios" → "cesionario". */
const raiz = (palabra: string): string =>
  palabra.length > 4 && palabra.endsWith('s') ? palabra.slice(0, -1) : palabra;

const palabras = (texto: string): Set<string> =>
  new Set(
    expandirSinonimos(texto)
      .split(' ')
      .filter((palabra) => palabra.length > 0 && !VACIAS.has(palabra))
      .map(raiz),
  );

const mencionaCodigo = (licencia: LicenciaVigente, consulta: string): boolean => {
  const codigo = normalizar(licencia.codigo);
  return consulta.includes(` ${codigo} `) || consulta.includes(` ${codigo.replace(' ', '')} `);
};

/** Coincidencia por palabras: gana la que coincide más y le sobran menos ("alto" prefiere "riesgo
 * alto" a "muy alto"). 0 si no coincide ninguna. */
const coincidencia = (licencia: LicenciaVigente, buscadas: Set<string>): number => {
  const propias = palabras(licencia.nombre);
  const coinciden = [...propias].filter((palabra) => buscadas.has(palabra)).length;
  return coinciden === 0 ? 0 : coinciden * 10 - (propias.size - coinciden);
};

const CODIGO_EN_TEXTO = /\bLIC-\d{2}\b/gi;

/**
 * Cuán reciente es la última respuesta del chat que nombró cada código (por sus `codigosReceta` o
 * por un `LIC-xx` en su texto): mayor es más reciente.
 */
const recenciaDeCodigos = (historial: readonly TurnoContexto[]): Map<string, number> => {
  const recencia = new Map<string, number>();
  historial.forEach((turno, indice) => {
    if (turno.rol !== 'ORIENTADOR') {
      return;
    }
    const enTexto = turno.texto.match(CODIGO_EN_TEXTO) ?? [];
    for (const codigo of [...(turno.codigosReceta ?? []), ...enTexto]) {
      recencia.set(codigo.toUpperCase(), indice);
    }
  });
  return recencia;
};

const puntajeTema = (tema: TemaGuia, consulta: string, buscadas: Set<string>): number =>
  tema.palabrasClave.filter((clave) => {
    const normal = normalizar(clave);
    return normal.includes(' ') ? consulta.includes(` ${normal} `) : buscadas.has(raiz(normal));
  }).length;

/** Los de mayor puntaje (> 0), estables en el orden original ante empates. */
const mejores = <T>(elementos: readonly T[], puntaje: (elemento: T) => number, cuantos: number) =>
  elementos
    .map((elemento, indice) => ({ elemento, indice, puntos: puntaje(elemento) }))
    .filter(({ puntos }) => puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.indice - b.indice)
    .slice(0, cuantos)
    .map(({ elemento }) => elemento);

const cifrasDeLicencia = (licencia: LicenciaVigente): string[] => [
  normalizarMonto(...(licencia.tasa.split('.') as [string, string?])),
  ...(licencia.plazoDias === null ? [] : [clavePlazo(licencia.plazoDias, 'dias')]),
  ...(licencia.plazoItseDias === null ? [] : [clavePlazo(licencia.plazoItseDias, 'dias')]),
  ...(licencia.vigenciaMeses === null ? [] : [clavePlazo(licencia.vigenciaMeses, 'meses')]),
  ...(licencia.ordenItse === 'DENTRO_6_MESES' ? [clavePlazo(6, 'meses')] : []),
];

export const seleccionarContexto = (
  pregunta: string,
  historial: readonly TurnoContexto[],
  licencias: readonly LicenciaVigente[],
  temas: readonly TemaGuia[],
): ContextoOrientacion => {
  const anterioresPersona = historial
    .filter((turno) => turno.rol === 'PERSONA')
    .map((turno) => turno.texto)
    .join(' ');
  const textoConsulta = `${pregunta} ${anterioresPersona}`;
  const consulta = ` ${expandirSinonimos(textoConsulta)} `;
  const buscadas = palabras(textoConsulta);
  const enPregunta = palabras(pregunta);
  const enAnteriores = palabras(anterioresPersona);
  const recencia = recenciaDeCodigos(historial);
  const consultaPregunta = ` ${normalizar(pregunta)} `;

  // Orden de prioridad (FR-027): un código en la pregunta actual; las palabras de la pregunta actual;
  // las licencias de las respuestas anteriores del chat, la más reciente primero; y las palabras de
  // las preguntas anteriores de la persona.
  const puntaje = (licencia: LicenciaVigente): number => {
    const deLaPregunta = coincidencia(licencia, enPregunta);
    const reciente = recencia.get(licencia.codigo);
    const deAnteriores = coincidencia(licencia, enAnteriores);
    return (
      (mencionaCodigo(licencia, consultaPregunta) ? 1000 : 0) +
      (deLaPregunta > 0 ? 300 + deLaPregunta : 0) +
      (reciente === undefined ? 0 : 100 + reciente) +
      Math.max(0, deAnteriores)
    );
  };
  const detalle = mejores(licencias, puntaje, MAXIMO_RECETAS_DETALLE);
  const coincidentes = mejores(
    temas,
    (tema) => puntajeTema(tema, consulta, buscadas),
    MAXIMO_TEMAS,
  );
  const elegidos =
    coincidentes.length > 0
      ? coincidentes
      : temas.filter((tema) => TEMAS_GENERALES.includes(tema.id));

  const cifrasPermitidas = new Set([
    ...licencias.flatMap(cifrasDeLicencia),
    ...detalle.flatMap((licencia) => extraerCifras(licencia.requisitos.join('\n'))),
    ...elegidos.flatMap((tema) => extraerCifras(tema.respuesta)),
  ]);

  return {
    licencias,
    detalle,
    temas: elegidos,
    temaPrincipal: coincidentes[0] ?? null,
    cifrasPermitidas,
    pideRequisitos: enPregunta.has('requisito'),
  };
};
