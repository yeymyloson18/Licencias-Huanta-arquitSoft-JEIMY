import { AplicarPagoRegistrado } from '../../../../../src/modulos/tramites/aplicacion/aplicar-pago-registrado';
import {
  AplicarResultadoItse,
  type ResultadoInspeccion,
} from '../../../../../src/modulos/tramites/aplicacion/aplicar-resultado-itse';
import {
  ErrorTransicionNoAplicada,
  TransicionesSistema,
} from '../../../../../src/modulos/tramites/aplicacion/transiciones-sistema';
import type { ExpedienteParaDecidir } from '../../../../../src/modulos/tramites/dominio/puertos/repositorio-decisiones';
import { DecisionesEnMemoria } from '../apoyo/decisiones-en-memoria';
import { RelojFalso } from '../apoyo/dobles';

const NUMERO = 'EXP-2026-000001';
const CERTIFICADO = { numero: 'ITSE-001', emitidoEn: '2026-11-19' };

const resultado = (cambios: Partial<ResultadoInspeccion> = {}): ResultadoInspeccion => ({
  numeroExpediente: NUMERO,
  tipo: 'PREVIA',
  resultado: 'FAVORABLE',
  observaciones: null,
  certificado: CERTIFICADO,
  ...cambios,
});

describe('AplicarResultadoItse (FR-004 a FR-006 de la 006)', () => {
  const aplicar = (inicial: Partial<ExpedienteParaDecidir>, leido: ResultadoInspeccion | null) => {
    const decisiones = new DecisionesEnMemoria(inicial);
    const promesa = new AplicarResultadoItse({
      transiciones: new TransicionesSistema({ decisiones, reloj: new RelojFalso() }),
      resultados: { resultadoDe: () => Promise.resolve(leido) },
    }).ejecutar({ numeroExpediente: NUMERO, inspeccionId: 'ins-1' });
    return { decisiones, promesa };
  };

  it('PREVIA favorable: pide la licencia con el certificado, sin cambiar el estado', async () => {
    const { decisiones, promesa } = aplicar({ ruta: 'B', estado: 'EN_INSPECCION' }, resultado());

    expect(await promesa).toBe('APLICADO');
    expect(decisiones.aplicadas).toEqual([]);
    expect(decisiones.publicados).toEqual([
      {
        tipo: 'LicenciaSolicitada',
        datos: {
          numeroExpediente: NUMERO,
          tipo: 'DEFINITIVA',
          certificadoNumero: 'ITSE-001',
          certificadoEmitidoEn: '2026-11-19',
        },
      },
    ]);
  });

  it('PREVIA desfavorable: DENEGADO con las observaciones como motivo', async () => {
    const { decisiones, promesa } = aplicar(
      { ruta: 'B', estado: 'EN_INSPECCION' },
      resultado({ resultado: 'DESFAVORABLE', observaciones: 'Sin extintores', certificado: null }),
    );

    await promesa;

    expect(decisiones.expediente?.estado).toBe('DENEGADO');
    expect(decisiones.aplicadas[0]?.comentario).toBe('Sin extintores');
  });

  it('POSTERIOR favorable: FINALIZADO y certificado para la licencia', async () => {
    const { decisiones, promesa } = aplicar(
      { ruta: 'A', estado: 'ITSE_POSTERIOR_PENDIENTE' },
      resultado({ tipo: 'POSTERIOR' }),
    );

    await promesa;

    expect(decisiones.expediente?.estado).toBe('FINALIZADO');
    expect(decisiones.aplicadas[0]?.eventos.at(-1)).toEqual({
      tipo: 'CertificadoItseRegistrado',
      datos: { numeroExpediente: NUMERO, numero: 'ITSE-001', emitidoEn: '2026-11-19' },
    });
  });

  it('POSTERIOR desfavorable: DERIVADO_A_FISCALIZACION (sin motivo usa uno genérico)', async () => {
    const { decisiones, promesa } = aplicar(
      { ruta: 'A', estado: 'ITSE_POSTERIOR_PENDIENTE' },
      resultado({ tipo: 'POSTERIOR', resultado: 'DESFAVORABLE', certificado: null }),
    );

    await promesa;

    expect(decisiones.expediente?.estado).toBe('DERIVADO_A_FISCALIZACION');
    expect(decisiones.aplicadas[0]?.comentario).toBe(
      'Resultado desfavorable de la inspección ITSE',
    );
  });

  it('BODEGA favorable: solo el certificado; desfavorable: DERIVADO_A_FISCALIZACION', async () => {
    const favorable = aplicar(
      { ruta: 'C', estado: 'LICENCIA_PROVISIONAL' },
      resultado({ tipo: 'BODEGA' }),
    );
    await favorable.promesa;
    expect(favorable.decisiones.aplicadas).toEqual([]);
    expect(favorable.decisiones.publicados.map((e) => e.tipo)).toEqual([
      'CertificadoItseRegistrado',
    ]);

    const desfavorable = aplicar(
      { ruta: 'C', estado: 'LICENCIA_PROVISIONAL' },
      resultado({
        tipo: 'BODEGA',
        resultado: 'DESFAVORABLE',
        observaciones: 'Local sin ventilación',
      }),
    );
    await desfavorable.promesa;
    expect(desfavorable.decisiones.expediente?.estado).toBe('DERIVADO_A_FISCALIZACION');
  });

  it.each([
    ['PREVIA', 'FINALIZADO'],
    ['PREVIA', 'DENEGADO'],
    ['PREVIA', 'LICENCIA_EMITIDA'],
    ['POSTERIOR', 'FINALIZADO'],
    ['BODEGA', 'DERIVADO_A_FISCALIZACION'],
  ] as const)('%s repetido con el expediente ya en %s no hace nada', async (tipo, estado) => {
    const { decisiones, promesa } = aplicar({ estado }, resultado({ tipo }));

    expect(await promesa).toBe('YA_APLICADO');
    expect(decisiones.aplicadas).toEqual([]);
    expect(decisiones.publicados).toEqual([]);
  });

  it('en un estado inesperado o sin resultado (o de otro expediente) falla para reintentar', async () => {
    await expect(aplicar({ estado: 'PAGADO' }, resultado()).promesa).rejects.toBeInstanceOf(
      ErrorTransicionNoAplicada,
    );
    await expect(aplicar({ estado: 'EN_INSPECCION' }, null).promesa).rejects.toBeInstanceOf(
      ErrorTransicionNoAplicada,
    );
    await expect(
      aplicar({ estado: 'EN_INSPECCION' }, resultado({ numeroExpediente: 'EXP-2026-000009' }))
        .promesa,
    ).rejects.toBeInstanceOf(ErrorTransicionNoAplicada);
  });
});

describe('Pago de la ruta B (FR-002 de la 006)', () => {
  it('PENDIENTE_PAGO → PAGADO → EN_INSPECCION e inspección PREVIA, en una decisión', async () => {
    const decisiones = new DecisionesEnMemoria({ ruta: 'B', estado: 'PENDIENTE_PAGO' });

    await new AplicarPagoRegistrado({ decisiones, reloj: new RelojFalso() }).ejecutar({
      numeroExpediente: NUMERO,
    });

    const decision = decisiones.aplicadas[0];
    expect(decision?.estadoNuevo).toBe('EN_INSPECCION');
    expect(decision?.historial?.map((paso) => paso.estadoNuevo)).toEqual([
      'PAGADO',
      'EN_INSPECCION',
    ]);
    expect(decision?.eventos.map((evento) => evento.tipo)).toEqual([
      'EstadoExpedienteCambiado',
      'EstadoExpedienteCambiado',
      'InspeccionRequerida',
    ]);
    expect(decision?.eventos.at(-1)?.datos).toEqual({ numeroExpediente: NUMERO, tipo: 'PREVIA' });
  });
});
