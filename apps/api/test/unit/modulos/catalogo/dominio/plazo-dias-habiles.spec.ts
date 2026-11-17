import { ErrorDominio } from '../../../../../src/modulos/catalogo/dominio/error-dominio';
import { PlazoDiasHabiles } from '../../../../../src/modulos/catalogo/dominio/plazo-dias-habiles';

describe('PlazoDiasHabiles', () => {
  it.each([1, 2, 5, 8, 30])('acepta %i', (dias) => {
    expect(PlazoDiasHabiles.crear(dias).dias).toBe(dias);
  });

  it.each([0, -1, 1.5, Number.NaN])('rechaza %p', (dias) => {
    expect(() => PlazoDiasHabiles.crear(dias)).toThrow(ErrorDominio);
  });
});
