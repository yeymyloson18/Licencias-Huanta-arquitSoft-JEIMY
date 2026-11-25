import { normalizar } from './cifras';

// Sinónimos en español sencillo (012, FR-028; corrección por la conversación real del 2026-11-24):
// cada frase normalizada agrega la palabra que usan el catálogo o la guía. Así "la categoría más
// básica" encuentra la licencia de riesgo bajo y "papeles" se entiende como requisitos.

const SINONIMOS: readonly (readonly [string, string])[] = [
  // → riesgo bajo
  ['basica', 'bajo'],
  ['basico', 'bajo'],
  ['mas simple', 'bajo'],
  ['mas sencilla', 'bajo'],
  ['mas sencillo', 'bajo'],
  ['pequeno negocio', 'bajo'],
  ['negocio pequeno', 'bajo'],
  // → requisitos
  ['documento', 'requisitos'],
  ['documentos', 'requisitos'],
  ['papeles', 'requisitos'],
  ['papeleo', 'requisitos'],
  ['requerido', 'requisitos'],
  ['requeridos', 'requisitos'],
  ['requisito', 'requisitos'],
  // → bodega
  ['tienda', 'bodega'],
  ['tiendita', 'bodega'],
  ['abarrotes', 'bodega'],
];

/** El texto normalizado, con las palabras equivalentes agregadas al final. */
export const expandirSinonimos = (texto: string): string => {
  const normal = normalizar(texto);
  const relleno = ` ${normal} `;
  const agregadas = SINONIMOS.filter(([frase]) => relleno.includes(` ${frase} `)).map(
    ([, destino]) => destino,
  );
  return [normal, ...new Set(agregadas)].join(' ').trim();
};
