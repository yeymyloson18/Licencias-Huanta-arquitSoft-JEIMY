import {
  comoFechaBase,
  deFechaBase,
  diaDeLaSemana,
  esFechaValida,
  fechaLima,
  sumarDias,
  sumarMeses,
} from '../../../../src/compartido/dominio/fecha-lima';

describe('Fechas en hora de Lima (006)', () => {
  it('el día de Lima de un instante (UTC-5)', () => {
    expect(fechaLima(new Date('2026-11-21T04:59:00.000Z'))).toBe('2026-11-20');
    expect(fechaLima(new Date('2026-11-21T05:00:00.000Z'))).toBe('2026-11-21');
  });

  it('valida fechas reales', () => {
    expect(esFechaValida('2026-02-28')).toBe(true);
    expect(esFechaValida('2028-02-29')).toBe(true);
    expect(esFechaValida('2026-02-29')).toBe(false);
    expect(esFechaValida('2026-13-01')).toBe(false);
    expect(esFechaValida('20-11-2026')).toBe(false);
  });

  it('suma días cruzando meses y años', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('suma meses y años con el último día del mes cuando no existe', () => {
    expect(sumarMeses('2026-11-20', 12)).toBe('2027-11-20');
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMeses('2028-02-29', 24)).toBe('2030-02-28');
    expect(sumarMeses('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('día de la semana y conversión con columnas date', () => {
    expect(diaDeLaSemana('2026-11-20')).toBe(5); // viernes
    expect(diaDeLaSemana('2026-11-22')).toBe(0); // domingo
    expect(deFechaBase(comoFechaBase('2026-11-20'))).toBe('2026-11-20');
  });
});
