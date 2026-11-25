import { revisarCifras } from '../../../../../src/modulos/orientacion/dominio/revisar-cifras';

// FR-005 de la 012 (research R-06): ninguna tasa ni plazo que no esté en el contexto enviado llega al
// administrado. La revisión no confía en el modelo.

const permitidas = new Set(['177.10', '0.00', '2 dias', '15 dias', '12 meses', '2 anos']);

describe('revisarCifras', () => {
  it.each([
    'La tasa es S/ 177.10 y demora 2 días hábiles.',
    'Cuesta S/. 177.1 (lo mismo que S/ 177.10).',
    'Es gratuita: S/ 0.00, con vigencia de 12 meses.',
    'Demora 15 días calendario.',
    'El certificado se renueva cada 2 años.',
  ])('aprueba un texto con cifras del contexto: "%s"', (texto) => {
    expect(revisarCifras(texto, permitidas)).toEqual({ aprobada: true, ajenas: [] });
  });

  it('un texto sin cifras se aprueba', () => {
    expect(revisarCifras('Use el asistente para saber cuál le corresponde.', permitidas)).toEqual({
      aprobada: true,
      ajenas: [],
    });
  });

  it.each([
    ['un monto ajeno', 'La tasa es S/ 999.99.', ['999.99']],
    ['un monto en soles ajeno', 'Son 123.45 soles.', ['123.45']],
    ['un plazo ajeno', 'Demora 30 días.', ['30 dias']],
    ['una vigencia ajena', 'Dura 24 meses.', ['24 meses']],
    ['una cifra ajena junto a una del contexto', 'S/ 177.10 más S/ 50.', ['50.00']],
  ])('rechaza %s', (_caso, texto, ajenas) => {
    expect(revisarCifras(texto, permitidas)).toEqual({ aprobada: false, ajenas });
  });

  it('los números que no son montos ni plazos no cuentan', () => {
    expect(
      revisarCifras('Vea la LIC-02 del TUPA 2024, paso 3, de hasta 50 m².', permitidas).aprobada,
    ).toBe(true);
  });
});
