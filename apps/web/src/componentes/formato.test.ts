import {
  etiquetaCondicion,
  formatearCalificacion,
  formatearItse,
  formatearPlazo,
  formatearPlazoConTipo,
  formatearTasa,
  formatearTasaFicha,
  formatearVigencia,
} from './formato';

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

describe('formatearTasaFicha', () => {
  it('muestra "Gratuito" si la tasa es cero y el monto en soles en otro caso', () => {
    expect(formatearTasaFicha('0.00')).toBe('Gratuito');
    expect(normalizar(formatearTasaFicha('177.10'))).toBe('S/ 177.10');
  });
});

describe('formatearPlazoConTipo', () => {
  it.each<[number | null, 'HABILES' | 'CALENDARIO' | undefined, string | null]>([
    [2, 'HABILES', '2 días hábiles'],
    [1, 'CALENDARIO', '1 día calendario'],
    [10, 'CALENDARIO', '10 días calendario'],
    [3, undefined, '3 días hábiles'],
    [null, 'HABILES', null],
  ])('%p %p → %p', (dias, tipo, esperado) => {
    expect(formatearPlazoConTipo(dias, tipo)).toBe(esperado);
  });
});

describe('formatearCalificacion', () => {
  it('traduce las tres calificaciones del contrato', () => {
    expect(formatearCalificacion('APROBACION_AUTOMATICA')).toBe('Aprobación automática');
    expect(formatearCalificacion('EVALUACION_PREVIA_SILENCIO_POSITIVO')).toBe(
      'Evaluación previa con silencio positivo',
    );
    expect(formatearCalificacion('SERVICIO_EXCLUSIVO')).toBe('Servicio prestado en exclusividad');
  });
});

describe('formatearItse', () => {
  it.each<[Parameters<typeof formatearItse>[0], number | null, string | null]>([
    ['POSTERIOR', 9, 'Posterior, hasta 9 días hábiles'],
    ['PREVIA', 7, 'Previa, hasta 7 días hábiles'],
    ['PREVIA', null, 'Previa'],
    ['DENTRO_6_MESES', null, 'Se notifica dentro de 6 meses'],
    [null, null, null],
  ])('%p con plazo %p → %p', (orden, plazo, esperado) => {
    expect(formatearItse(orden, plazo)).toBe(esperado);
  });
});

describe('formatearVigencia', () => {
  it.each<[number | null, 'LICENCIA' | 'TRAMITE_CONECTADO', 'A' | 'B' | 'C' | null, string | null]>(
    [
      [null, 'LICENCIA', 'A', 'Indeterminada'],
      [12, 'LICENCIA', 'C', 'Provisional de 12 meses'],
      [24, 'LICENCIA', 'B', '24 meses'],
      [1, 'LICENCIA', 'A', '1 mes'],
      [null, 'TRAMITE_CONECTADO', null, null],
    ],
  )('%p (%s, ruta %p) → %p', (meses, tipo, ruta, esperado) => {
    expect(formatearVigencia(meses, tipo, ruta)).toBe(esperado);
  });
});

describe('etiquetaCondicion', () => {
  it('no etiqueta lo que se pide siempre y etiqueta los condicionales', () => {
    expect(etiquetaCondicion('SIEMPRE')).toBeNull();
    expect(etiquetaCondicion('CON_REPRESENTANTE')).toBe('Solo si actúa un representante');
    expect(etiquetaCondicion('GIRO_ESPECIAL')).toBe('Solo si tu giro lo exige');
    expect(etiquetaCondicion('SIN_PLANOS_VIGENTES')).toBe(
      'No se pide si presentaste planos en los últimos 5 años y la edificación no cambió',
    );
  });
});
