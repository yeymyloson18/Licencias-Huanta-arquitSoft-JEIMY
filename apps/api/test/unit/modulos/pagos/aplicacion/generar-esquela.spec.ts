import { GenerarEsquela } from '../../../../../src/modulos/pagos/aplicacion/generar-esquela';
import type { Esquela } from '../../../../../src/modulos/pagos/dominio/esquela';
import { ErrorDatoPagos } from '../../../../../src/modulos/pagos/dominio/errores';
import type { RepositorioEsquelas } from '../../../../../src/modulos/pagos/dominio/puertos/repositorio-esquelas';

const T0 = new Date('2026-11-20T15:00:00.000Z');

class EsquelasEnMemoria implements Pick<RepositorioEsquelas, 'crearSiNoExiste'> {
  readonly esquelas = new Map<string, Esquela>();
  crearSiNoExiste(esquela: Esquela) {
    if (this.esquelas.has(esquela.numeroExpediente)) {
      return Promise.resolve(false);
    }
    this.esquelas.set(esquela.numeroExpediente, esquela);
    return Promise.resolve(true);
  }
}

describe('GenerarEsquela (CU14 de la 005)', () => {
  const solicitud = {
    numeroExpediente: 'EXP-2026-000001',
    codigoReceta: 'LIC-02',
    concepto: 'Licencia de funcionamiento – riesgo medio',
    monto: '177.10',
  };

  it('crea la esquela con los datos del evento y la hora del reloj', async () => {
    const esquelas = new EsquelasEnMemoria();

    const resultado = await new GenerarEsquela({ esquelas, reloj: { ahora: () => T0 } }).ejecutar(
      solicitud,
    );

    expect(resultado).toEqual({ creada: true });
    expect(esquelas.esquelas.get('EXP-2026-000001')?.aDatos()).toMatchObject({
      codigo: 'ESQ-EXP-2026-000001',
      monto: '177.10',
      generadaEn: T0,
    });
  });

  it('generar dos veces no duplica', async () => {
    const esquelas = new EsquelasEnMemoria();
    const generar = new GenerarEsquela({ esquelas, reloj: { ahora: () => T0 } });

    await generar.ejecutar(solicitud);
    const segunda = await generar.ejecutar({ ...solicitud, monto: '305.90' });

    expect(segunda).toEqual({ creada: false });
    expect(esquelas.esquelas.size).toBe(1);
    expect(esquelas.esquelas.get('EXP-2026-000001')?.aDatos().monto).toBe('177.10');
  });

  it('un evento con monto 0 no crea nada', async () => {
    const esquelas = new EsquelasEnMemoria();

    await expect(
      new GenerarEsquela({ esquelas, reloj: { ahora: () => T0 } }).ejecutar({
        ...solicitud,
        monto: '0.00',
      }),
    ).rejects.toBeInstanceOf(ErrorDatoPagos);
    expect(esquelas.esquelas.size).toBe(0);
  });
});
