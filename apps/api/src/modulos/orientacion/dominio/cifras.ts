// Normalización de textos y extracción de cifras (montos y plazos) para el chat de orientación (012,
// research R-04 y R-06). Funciones puras: las usan la selección del contexto y la revisión de cifras.

const sinTildes = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Minúsculas, sin tildes ni signos, con un espacio entre palabras. */
export const normalizar = (texto: string): string =>
  sinTildes(texto)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const NUMERO = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;
const MONTO_CON_SIMBOLO = new RegExp(String.raw`s\/\.?\s*${NUMERO}`, 'g');
const MONTO_EN_SOLES = new RegExp(String.raw`(?<![\d.,])${NUMERO}\s*soles\b`, 'g');
const PLAZO = /(?<![\d.,])(\d+)\s*(dias?|mes(?:es)?|anos?)\b/g;

/** "dia" o "dias" → "dias"; "mes" o "meses" → "meses"; "ano" o "anos" → "anos". */
const unidadDe = (texto: string): 'dias' | 'meses' | 'anos' =>
  texto.startsWith('dia') ? 'dias' : texto.startsWith('mes') ? 'meses' : 'anos';

/** Monto en soles con dos decimales: "177.1" y "177.10" son el mismo monto. */
export const normalizarMonto = (entero: string, decimales = ''): string =>
  `${entero.replace(/,/g, '')}.${decimales.padEnd(2, '0')}`;

/** Clave de un plazo: "15 dias", "12 meses" o "2 anos" (los días hábiles y calendario cuentan igual). */
export const clavePlazo = (cantidad: number, unidad: 'dias' | 'meses' | 'anos'): string =>
  `${String(cantidad)} ${unidad}`;

/**
 * Montos (`S/ 123.45`, `S/. 123`, `123.45 soles`) y plazos (`15 días`, `15 días hábiles`, `12 meses`,
 * `2 años`) de un texto, normalizados y sin repetir. Los códigos, años sueltos, áreas o números de
 * paso no cuentan.
 */
export const extraerCifras = (texto: string): string[] => {
  const base = sinTildes(texto);
  const cifras = new Set<string>();
  for (const patron of [MONTO_CON_SIMBOLO, MONTO_EN_SOLES]) {
    base.replace(patron, (_monto, entero: string, decimales: string | undefined) => {
      cifras.add(normalizarMonto(entero, decimales));
      return '';
    });
  }
  base.replace(PLAZO, (_plazo, cantidad: string, unidad: string) => {
    cifras.add(clavePlazo(Number(cantidad), unidadDe(unidad)));
    return '';
  });
  return [...cifras];
};
