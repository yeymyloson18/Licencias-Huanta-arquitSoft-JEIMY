import { CalendarioHabil } from '../../../../../src/compartido/dominio/calendario-habil';
import {
  ErrorRangoInvalido,
  rangoDesde,
} from '../../../../../src/modulos/reportes/dominio/rango-fechas';
import {
  calcularTablero,
  centimosDe,
  diasDeAtencion,
  ErrorMontoInvalido,
  ingresosDe,
  solesDe,
  tiemposPorReceta,
} from '../../../../../src/modulos/reportes/dominio/tablero';

// Noviembre de 2026: el 2 es lunes. Feriado ficticio el miércoles 4.
const calendario = new CalendarioHabil(new Set(['2026-11-04']));

describe('Rango del tablero (FR-001 y FR-006 de la 007)', () => {
  it('sin fechas toma el mes actual hasta hoy', () => {
    expect(rangoDesde({}, '2026-11-20')).toEqual({ desde: '2026-11-01', hasta: '2026-11-20' });
  });

  it('acepta un rango válido de hasta 366 días', () => {
    expect(rangoDesde({ desde: '2026-01-01', hasta: '2027-01-01' }, '2026-11-20')).toEqual({
      desde: '2026-01-01',
      hasta: '2027-01-01',
    });
  });

  it.each([
    [{ desde: '2026-11-01' }, 'hasta'],
    [{ hasta: '2026-11-01' }, 'desde'],
    [{ desde: '2026-02-30', hasta: '2026-11-01' }, 'desde'],
    [{ desde: '2026-11-01', hasta: 'mañana' }, 'hasta'],
    [{ desde: '2026-11-10', hasta: '2026-11-01' }, 'hasta'],
    [{ desde: '2026-01-01', hasta: '2027-01-02' }, 'hasta'],
  ])('rechaza %j en el campo %s', (entrada, campo) => {
    expect(() => rangoDesde(entrada, '2026-11-20')).toThrow(ErrorRangoInvalido);
    try {
      rangoDesde(entrada, '2026-11-20');
    } catch (error) {
      expect((error as ErrorRangoInvalido).campo).toBe(campo);
    }
  });
});

describe('Cálculos del tablero (FR-003, FR-004 y FR-007 de la 007)', () => {
  it('días de atención: hábiles sin feriados ni días suspendidos', () => {
    // Del lunes 2 al viernes 13: 3, 5, 6, 9, 10, 11, 12, 13 = 8 días hábiles (el 4 es feriado).
    const sinSuspension = {
      codigoReceta: 'LIC-02',
      presentadoEn: '2026-11-02',
      terminadoEn: '2026-11-13',
      suspensiones: [],
    };
    // Suspendido del 5 al 9 (6 y 9 = 2 días) y otra que empieza antes y termina después (recortada).
    const conSuspension = {
      ...sinSuspension,
      suspensiones: [
        { desde: '2026-11-05', hasta: '2026-11-09' },
        { desde: '2026-11-12', hasta: '2026-11-20' },
      ],
    };

    expect(diasDeAtencion(sinSuspension, calendario)).toBe(8);
    expect(diasDeAtencion(conSuspension, calendario)).toBe(5);
    expect(diasDeAtencion({ ...sinSuspension, terminadoEn: '2026-11-02' }, calendario)).toBe(0);
    expect(
      diasDeAtencion(
        { ...sinSuspension, suspensiones: [{ desde: '2026-10-01', hasta: '2026-12-01' }] },
        calendario,
      ),
    ).toBe(0);
    expect(
      diasDeAtencion(
        { ...sinSuspension, suspensiones: [{ desde: '2026-11-20', hasta: '2026-11-25' }] },
        calendario,
      ),
    ).toBe(8);
  });

  it('promedio con un decimal, porcentaje dentro del plazo, plazo 0 y recetas sin atendidos', () => {
    const atencion = (codigoReceta: string, terminadoEn: string) => ({
      codigoReceta,
      presentadoEn: '2026-11-02',
      terminadoEn,
      suspensiones: [],
    });

    const tiempos = tiemposPorReceta(
      [
        atencion('LIC-02', '2026-11-03'), // 1 día
        atencion('LIC-02', '2026-11-05'), // 2 días (el 4 es feriado)
        atencion('LIC-02', '2026-11-09'), // 4 días
        atencion('LIC-09', '2026-11-03'),
        atencion('LIC-99', '2026-11-03'),
      ],
      [
        { codigoReceta: 'LIC-03', plazoDias: 8 },
        { codigoReceta: 'LIC-02', plazoDias: 2 },
        { codigoReceta: 'LIC-09', plazoDias: null },
      ],
      calendario,
    );

    expect(tiempos).toEqual([
      {
        codigoReceta: 'LIC-02',
        plazoTupaDias: 2,
        atendidos: 3,
        promedioDiasHabiles: 2.3,
        dentroDelPlazo: 66.7,
      },
      {
        codigoReceta: 'LIC-03',
        plazoTupaDias: 8,
        atendidos: 0,
        promedioDiasHabiles: null,
        dentroDelPlazo: null,
      },
      {
        codigoReceta: 'LIC-09',
        plazoTupaDias: 0,
        atendidos: 1,
        promedioDiasHabiles: 1,
        dentroDelPlazo: null,
      },
      {
        codigoReceta: 'LIC-99',
        plazoTupaDias: 0,
        atendidos: 1,
        promedioDiasHabiles: 1,
        dentroDelPlazo: null,
      },
    ]);
  });

  it('montos exactos al céntimo', () => {
    expect(centimosDe('0.10') + centimosDe('0.20')).toBe(30n);
    expect(solesDe(30n)).toBe('0.30');
    expect(solesDe(centimosDe('12345678.99'))).toBe('12345678.99');
    expect(() => centimosDe('10.5')).toThrow(ErrorMontoInvalido);
    expect(() => centimosDe('-1.00')).toThrow(ErrorMontoInvalido);
    expect(
      ingresosDe([
        { codigoReceta: 'LIC-03', monto: '305.90' },
        { codigoReceta: 'LIC-02', monto: '177.10' },
        { codigoReceta: 'LIC-02', monto: '0.10' },
      ]),
    ).toEqual({ total: '483.10', porReceta: { 'LIC-02': '177.20', 'LIC-03': '305.90' } });
    expect(ingresosDe([])).toEqual({ total: '0.00', porReceta: {} });
  });

  it('arma el tablero completo', () => {
    const tablero = calcularTablero({
      rango: { desde: '2026-11-01', hasta: '2026-11-20' },
      generadoEn: new Date('2026-11-20T15:00:00.000Z'),
      conteoPorEstado: { EN_EVALUACION: 2 },
      atenciones: [],
      plazos: [],
      pagos: [],
      calendario,
    });

    expect(tablero).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-20',
      generadoEn: '2026-11-20T15:00:00.000Z',
      expedientesPorEstado: { EN_EVALUACION: 2 },
      tiempoPromedioPorReceta: [],
      ingresos: { total: '0.00', porReceta: {} },
    });
  });
});
