import { ErrorDominio } from '../../../../../src/modulos/catalogo/dominio/error-dominio';
import { Tasa } from '../../../../../src/modulos/catalogo/dominio/tasa';

describe('Tasa', () => {
  it.each([
    ['159.50', 15950],
    ['305.90', 30590],
    ['0.00', 0],
    ['45.1', 4510],
    ['12', 1200],
  ])('desdeTexto(%s) guarda %i céntimos enteros', (texto, centimos) => {
    expect(Tasa.desdeTexto(texto).centimos).toBe(centimos);
  });

  it.each([
    ['159.50', '159.50'],
    ['305.90', '305.90'],
    ['0.00', '0.00'],
    ['45.1', '45.10'],
    ['12', '12.00'],
  ])('aTextoSoles de %s es %s', (texto, esperado) => {
    expect(Tasa.desdeTexto(texto).aTextoSoles()).toBe(esperado);
  });

  it('acepta 0 (gratuito, LIC-09)', () => {
    expect(Tasa.desdeTexto('0.00').esGratuita()).toBe(true);
    expect(Tasa.desdeTexto('0.01').esGratuita()).toBe(false);
  });

  it.each(['-1.00', '159.505', '1.2.3', 'abc', '', ' 10.00', '1e3', '10,50'])(
    'rechaza %p',
    (texto) => {
      expect(() => Tasa.desdeTexto(texto)).toThrow(ErrorDominio);
    },
  );

  it('construye desde céntimos', () => {
    expect(Tasa.desdeCentimos(53890).aTextoSoles()).toBe('538.90');
    expect(Tasa.desdeCentimos(5).aTextoSoles()).toBe('0.05');
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rechaza %p céntimos', (centimos) => {
    expect(() => Tasa.desdeCentimos(centimos)).toThrow(ErrorDominio);
  });

  it('compara por valor', () => {
    expect(Tasa.desdeTexto('10.5').esIgualA(Tasa.desdeCentimos(1050))).toBe(true);
    expect(Tasa.desdeTexto('10.5').esIgualA(Tasa.desdeCentimos(1051))).toBe(false);
  });
});
