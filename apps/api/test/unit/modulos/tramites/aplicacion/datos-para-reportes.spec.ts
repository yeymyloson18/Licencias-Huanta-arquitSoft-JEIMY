import {
  DatosParaReportes,
  suspensionesDe,
} from '../../../../../src/modulos/tramites/aplicacion/datos-para-reportes';
import type {
  ExpedienteEnTramite,
  ExpedienteTerminado,
  LectorParaReportes,
} from '../../../../../src/modulos/tramites/dominio/puertos/lector-para-reportes';

// Datos FICTICIOS. Las horas son de Lima (UTC-5).
const lima = (fechaHora: string) => new Date(`${fechaHora}-05:00`);

const terminado = (
  historial: [string, string][],
  terminadoEn = '2026-11-12T10:00:00',
): ExpedienteTerminado => ({
  numero: 'EXP-2026-000001',
  codigoReceta: 'LIC-02',
  presentadoEn: lima('2026-11-02T09:00:00'),
  terminadoEn: lima(terminadoEn),
  historial: historial.map(([estadoNuevo, cuando]) => ({ estadoNuevo, ocurridoEn: lima(cuando) })),
});

describe('Datos de Trámites para los reportes (007)', () => {
  it('las suspensiones van de la entrada a OBSERVADO o PENDIENTE_PAGO hasta el siguiente estado', () => {
    const expediente = terminado([
      ['REGISTRADO', '2026-11-02T09:00:00'],
      ['EN_EVALUACION', '2026-11-03T08:00:00'],
      ['OBSERVADO', '2026-11-04T10:00:00'],
      ['EN_EVALUACION', '2026-11-06T16:00:00'],
      ['PENDIENTE_PAGO', '2026-11-09T09:00:00'],
      ['PAGADO', '2026-11-10T11:00:00'],
      ['APROBADO', '2026-11-12T10:00:00'],
      ['LICENCIA_EMITIDA', '2026-11-12T10:00:01'],
    ]);

    expect(suspensionesDe(expediente)).toEqual([
      { desde: '2026-11-04', hasta: '2026-11-06' },
      { desde: '2026-11-09', hasta: '2026-11-10' },
    ]);
  });

  it('una suspensión sin salida en el historial se cierra al terminar la atención', () => {
    const expediente = terminado([['OBSERVADO', '2026-11-04T10:00:00']]);

    expect(suspensionesDe(expediente)).toEqual([{ desde: '2026-11-04', hasta: '2026-11-12' }]);
  });

  it('una entrada tarde por la noche cuenta en el día de Lima, no en el de UTC', () => {
    const expediente = terminado([
      ['PENDIENTE_PAGO', '2026-11-04T22:30:00'],
      ['PAGADO', '2026-11-05T08:00:00'],
    ]);

    expect(suspensionesDe(expediente)).toEqual([{ desde: '2026-11-04', hasta: '2026-11-05' }]);
  });

  it('convierte el rango de días de Lima en instantes [desde, hasta) y abrevia al titular', async () => {
    const llamadas: [Date, Date][] = [];
    const fila: ExpedienteEnTramite = {
      numero: 'EXP-2026-000002',
      codigoReceta: 'LIC-03',
      razonSocial: null,
      nombreTitular: 'Juana Pérez Quispe',
      giro: 'Bodega',
      zona: 'Centro',
      estado: 'EN_EVALUACION',
      presentadoEn: lima('2026-11-03T23:00:00'),
    };
    const lector: LectorParaReportes = {
      conteoPorEstado: (desde, hasta) => {
        llamadas.push([desde, hasta]);
        return Promise.resolve({ EN_EVALUACION: 2 });
      },
      terminados: (desde, hasta) => {
        llamadas.push([desde, hasta]);
        return Promise.resolve([terminado([['APROBADO', '2026-11-12T10:00:00']])]);
      },
      enTramite: () => Promise.resolve([fila]),
    };
    const datos = new DatosParaReportes(lector);

    expect(await datos.conteoPorEstado('2026-11-01', '2026-11-30')).toEqual({ EN_EVALUACION: 2 });
    expect(await datos.atencionesTerminadas('2026-11-01', '2026-11-30')).toEqual([
      {
        numero: 'EXP-2026-000001',
        codigoReceta: 'LIC-02',
        presentadoEn: '2026-11-02',
        terminadoEn: '2026-11-12',
        suspensiones: [],
      },
    ]);
    expect(await datos.expedientesEnTramite('LIC-03')).toEqual([
      {
        numero: 'EXP-2026-000002',
        codigoReceta: 'LIC-03',
        titularPublico: 'Juana P. Q.',
        giro: 'Bodega',
        zona: 'Centro',
        estado: 'EN_EVALUACION',
        presentadoEn: '2026-11-03',
      },
    ]);
    expect(llamadas.map(([d, h]) => [d.toISOString(), h.toISOString()])).toEqual([
      ['2026-11-01T05:00:00.000Z', '2026-12-01T05:00:00.000Z'],
      ['2026-11-01T05:00:00.000Z', '2026-12-01T05:00:00.000Z'],
    ]);
  });
});
