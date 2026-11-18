import { PoliticaClave } from '../../../../../src/modulos/seguridad/dominio/politica-clave';

describe('PoliticaClave (FR-022a)', () => {
  it('acepta 12 a 128 caracteres con al menos una letra y un número', () => {
    expect(PoliticaClave.validar('ClaveSegura2026')).toEqual([]);
    expect(PoliticaClave.validar(`a1${'x'.repeat(126)}`)).toEqual([]);
  });

  it('informa todas las reglas incumplidas', () => {
    expect(PoliticaClave.validar('corta')).toEqual(['LONGITUD_MINIMA', 'SIN_NUMERO']);
    expect(PoliticaClave.validar('123456789012')).toEqual(['SIN_LETRA']);
    expect(PoliticaClave.validar('soloLetrasLargas')).toEqual(['SIN_NUMERO']);
    expect(PoliticaClave.validar(`a1${'x'.repeat(127)}`)).toEqual(['LONGITUD_MAXIMA']);
    expect(PoliticaClave.validar('')).toEqual(['LONGITUD_MINIMA', 'SIN_LETRA', 'SIN_NUMERO']);
  });

  it('acepta letras con tilde y ñ como letras', () => {
    expect(PoliticaClave.validar('ñandúcañón12')).toEqual([]);
  });

  it('describe cada regla en español sin repetir la clave', () => {
    const mensaje = PoliticaClave.describir('LONGITUD_MINIMA');

    expect(mensaje).toBe('Debe tener al menos 12 caracteres');
    expect(PoliticaClave.describir('SIN_LETRA')).toBe('Debe incluir al menos una letra');
    expect(PoliticaClave.describir('SIN_NUMERO')).toBe('Debe incluir al menos un número');
    expect(PoliticaClave.describir('LONGITUD_MAXIMA')).toBe(
      'Debe tener como máximo 128 caracteres',
    );
  });
});
