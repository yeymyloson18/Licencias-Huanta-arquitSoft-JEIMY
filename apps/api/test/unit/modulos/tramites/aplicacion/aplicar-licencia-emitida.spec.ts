import { AplicarLicenciaEmitida } from '../../../../../src/modulos/tramites/aplicacion/aplicar-licencia-emitida';
import {
  ErrorTransicionNoAplicada,
  TransicionesSistema,
} from '../../../../../src/modulos/tramites/aplicacion/transiciones-sistema';
import type { ExpedienteParaDecidir } from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-decisiones';
import { DecisionesEnMemoria } from '../apoyo/decisiones-en-memoria';
import { RelojFalso, T0 } from '../apoyo/dobles';

const EVENTO = { numeroExpediente: 'EXP-2026-000001', numeroLicencia: 'LF-2026-000001' };

describe('AplicarLicenciaEmitida (FR-001, FR-003 y FR-004 de la 006)', () => {
  const aplicar = (decisiones: DecisionesEnMemoria) =>
    new AplicarLicenciaEmitida(
      new TransicionesSistema({ decisiones, reloj: new RelojFalso() }),
    ).ejecutar(EVENTO);

  const con = (inicial: Partial<ExpedienteParaDecidir>) => new DecisionesEnMemoria(inicial);

  it('ruta A: APROBADO → LICENCIA_EMITIDA → ITSE_POSTERIOR_PENDIENTE e inspección POSTERIOR', async () => {
    const decisiones = con({ ruta: 'A', estado: 'APROBADO' });

    expect(await aplicar(decisiones)).toBe('APLICADO');

    const decision = decisiones.aplicadas[0];
    expect(decision).toMatchObject({
      estadoEsperado: 'APROBADO',
      versionEsperada: 5,
      estadoNuevo: 'ITSE_POSTERIOR_PENDIENTE',
      usuarioId: null,
      auditoria: null,
      en: T0,
      historial: [
        {
          estadoAnterior: 'APROBADO',
          estadoNuevo: 'LICENCIA_EMITIDA',
          comentario: 'Licencia LF-2026-000001 emitida',
        },
        {
          estadoAnterior: 'LICENCIA_EMITIDA',
          estadoNuevo: 'ITSE_POSTERIOR_PENDIENTE',
          comentario: 'Espera la inspección ITSE posterior',
        },
      ],
    });
    expect(decision?.eventos).toEqual([
      {
        tipo: 'EstadoExpedienteCambiado',
        datos: {
          numeroExpediente: 'EXP-2026-000001',
          estadoAnterior: 'APROBADO',
          estadoNuevo: 'LICENCIA_EMITIDA',
        },
      },
      {
        tipo: 'EstadoExpedienteCambiado',
        datos: {
          numeroExpediente: 'EXP-2026-000001',
          estadoAnterior: 'LICENCIA_EMITIDA',
          estadoNuevo: 'ITSE_POSTERIOR_PENDIENTE',
        },
      },
      {
        tipo: 'InspeccionRequerida',
        datos: { numeroExpediente: 'EXP-2026-000001', tipo: 'POSTERIOR' },
      },
    ]);
  });

  it('ruta B: EN_INSPECCION → LICENCIA_EMITIDA → FINALIZADO, sin inspección nueva', async () => {
    const decisiones = con({ ruta: 'B', estado: 'EN_INSPECCION' });

    await aplicar(decisiones);

    expect(decisiones.expediente?.estado).toBe('FINALIZADO');
    expect(decisiones.eventos()).toEqual(['EstadoExpedienteCambiado', 'EstadoExpedienteCambiado']);
  });

  it('ruta C: APROBADO → LICENCIA_PROVISIONAL e inspección BODEGA', async () => {
    const decisiones = con({ ruta: 'C', estado: 'APROBADO', codigoReceta: 'LIC-09' });

    await aplicar(decisiones);

    expect(decisiones.expediente?.estado).toBe('LICENCIA_PROVISIONAL');
    expect(decisiones.aplicadas[0]?.eventos.at(-1)).toEqual({
      tipo: 'InspeccionRequerida',
      datos: { numeroExpediente: 'EXP-2026-000001', tipo: 'BODEGA' },
    });
  });

  it.each([
    'LICENCIA_EMITIDA',
    'ITSE_POSTERIOR_PENDIENTE',
    'FINALIZADO',
    'LICENCIA_PROVISIONAL',
  ] as const)('un evento repetido con el expediente ya en %s no hace nada', async (estado) => {
    const decisiones = con({ estado });

    expect(await aplicar(decisiones)).toBe('YA_APLICADO');
    expect(decisiones.aplicadas).toEqual([]);
  });

  it('en un estado inesperado falla para que el despachador reintente', async () => {
    await expect(aplicar(con({ estado: 'PAGADO' }))).rejects.toBeInstanceOf(
      ErrorTransicionNoAplicada,
    );
  });

  it('si otro cambio gana una vez, vuelve a leer; dos veces, falla', async () => {
    const decisiones = con({ ruta: 'A', estado: 'APROBADO' });
    decisiones.rechazar = 1;
    expect(await aplicar(decisiones)).toBe('APLICADO');

    const otra = con({ ruta: 'A', estado: 'APROBADO' });
    otra.rechazar = 2;
    await expect(aplicar(otra)).rejects.toBeInstanceOf(ErrorTransicionNoAplicada);
  });

  it('un expediente que no existe falla', async () => {
    const decisiones = con({});
    decisiones.expediente = null;

    await expect(aplicar(decisiones)).rejects.toBeInstanceOf(ErrorTransicionNoAplicada);
  });

  it('un plan sin pasos es un error de programación', async () => {
    const decisiones = con({});
    const transiciones = new TransicionesSistema({ decisiones, reloj: new RelojFalso() });

    await expect(transiciones.aplicar('EXP-2026-000001', () => ({ pasos: [] }))).rejects.toThrow(
      'al menos un paso',
    );
  });
});
