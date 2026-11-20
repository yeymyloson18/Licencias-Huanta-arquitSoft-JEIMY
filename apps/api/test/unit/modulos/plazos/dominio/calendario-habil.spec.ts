import { CalendarioHabil } from '../../../../../src/modulos/plazos/dominio/calendario-habil';
import { crearFeriado, ErrorDatoFeriado } from '../../../../../src/modulos/plazos/dominio/feriado';

// Calendario de noviembre de 2026: el 20 es viernes. Feriados de 2026 (research §R-17 de la 006).
const FERIADOS_2026 = new Set([
  '2026-01-01',
  '2026-04-02',
  '2026-04-03',
  '2026-07-28',
  '2026-07-29',
  '2026-12-08',
  '2026-12-09',
  '2026-12-25',
]);

describe('CalendarioHabil (FR-025 de la 006)', () => {
  const calendario = new CalendarioHabil(FERIADOS_2026);

  it('sábados, domingos y feriados no son hábiles', () => {
    expect(calendario.esHabil('2026-11-20')).toBe(true); // viernes
    expect(calendario.esHabil('2026-11-21')).toBe(false); // sábado
    expect(calendario.esHabil('2026-11-22')).toBe(false); // domingo
    expect(calendario.esHabil('2026-12-08')).toBe(false); // Inmaculada Concepción
  });

  it('cuenta desde el día siguiente y salta el fin de semana', () => {
    expect(calendario.sumarDiasHabiles('2026-11-16', 2)).toBe('2026-11-18'); // lunes → miércoles
    expect(calendario.sumarDiasHabiles('2026-11-19', 2)).toBe('2026-11-23'); // jueves → lunes
    expect(calendario.sumarDiasHabiles('2026-11-21', 1)).toBe('2026-11-23'); // sábado → lunes
    expect(calendario.sumarDiasHabiles('2026-11-20', 0)).toBe('2026-11-20');
  });

  it('salta feriados y fines de semana largos', () => {
    // 4-dic viernes; 7 lunes; 8 y 9 feriados → 2 días hábiles caen el 10.
    expect(calendario.sumarDiasHabiles('2026-12-04', 2)).toBe('2026-12-10');
    // Fiestas Patrias (martes 28 y miércoles 29 de julio).
    expect(calendario.sumarDiasHabiles('2026-07-27', 1)).toBe('2026-07-30');
  });

  it('cruza el fin de año', () => {
    // 24-dic jueves; 25 feriado; fin de semana; 28, 29, 30, 31 hábiles; 1-ene feriado.
    const conAnioNuevo = new CalendarioHabil(new Set([...FERIADOS_2026, '2027-01-01']));
    expect(conAnioNuevo.sumarDiasHabiles('2026-12-24', 5)).toBe('2027-01-04');
    expect(calendario.sumarDiasHabiles('2026-12-24', 5)).toBe('2027-01-01');
    expect(new CalendarioHabil(new Set(['2027-01-01'])).sumarDiasHabiles('2026-12-31', 1)).toBe(
      '2027-01-04',
    );
  });

  it('días hábiles restantes: positivos, cero el mismo día y negativos si venció', () => {
    expect(calendario.diasHabilesRestantes('2026-11-19', '2026-11-23')).toBe(2);
    expect(calendario.diasHabilesRestantes('2026-11-20', '2026-11-20')).toBe(0);
    expect(calendario.diasHabilesRestantes('2026-11-23', '2026-11-20')).toBe(-1);
    expect(calendario.diasHabilesRestantes('2026-12-07', '2026-12-10')).toBe(1);
  });
});

describe('Feriado (FR-023 de la 006)', () => {
  it('crea un feriado válido con la descripción recortada', () => {
    expect(
      crearFeriado({ fecha: '2026-06-24', descripcion: '  Inti Raymi ', alcance: 'REGIONAL' }),
    ).toEqual({
      fecha: '2026-06-24',
      descripcion: 'Inti Raymi',
      alcance: 'REGIONAL',
    });
  });

  it.each([
    [{ fecha: '2026-02-30', descripcion: 'X', alcance: 'LOCAL' }, 'fecha'],
    [{ fecha: '2026-06-24', descripcion: '   ', alcance: 'LOCAL' }, 'descripcion'],
    [{ fecha: '2026-06-24', descripcion: 'x'.repeat(151), alcance: 'LOCAL' }, 'descripcion'],
    [{ fecha: '2026-06-24', descripcion: 'X', alcance: 'MUNDIAL' }, 'alcance'],
  ])('%j es inválido en %s', (entrada, campo) => {
    try {
      crearFeriado(entrada);
      throw new Error('esperaba un error');
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorDatoFeriado);
      expect((error as ErrorDatoFeriado).campo).toBe(campo);
    }
  });
});
