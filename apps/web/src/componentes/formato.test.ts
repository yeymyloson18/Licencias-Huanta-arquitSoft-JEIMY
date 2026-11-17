import { formatearPlazo, formatearTasa } from './formato';

// Intl separa "S/" del monto con un espacio que no se parte (U+00A0); se normaliza para comparar.
const normalizar = (texto: string) => texto.replace(/\s/g, ' ');

describe('formatearTasa', () => {
  it.each([
    ['159.50', 'S/ 159.50'],
    ['0.00', 'S/ 0.00'],
    ['538.90', 'S/ 538.90'],
    ['1234.50', 'S/ 1,234.50'],
  ])('%s → %s', (texto, esperado) => {
    expect(normalizar(formatearTasa(texto))).toBe(esperado);
  });
});

describe('formatearPlazo', () => {
  it.each<[number | null | undefined, string]>([
    [2, '2 días hábiles'],
    [8, '8 días hábiles'],
    [1, '1 día hábil'],
    [null, 'Plazo no aplica'],
    [undefined, 'Plazo no aplica'],
  ])('%p → %s', (dias, esperado) => {
    expect(formatearPlazo(dias)).toBe(esperado);
  });
});
