import {
  type DatosInspeccion,
  ErrorDatoInspeccion,
  ErrorInspeccionYaRegistrada,
  ErrorNoEsInspectorAsignado,
  Inspeccion,
  normalizarNumeroCertificado,
} from '../../../../../src/modulos/inspecciones/dominio/inspeccion';

const INSPECTOR = '00000000-0000-4000-8000-0000000000a1';
const EN = new Date('2026-11-20T15:00:00.000Z');

const PENDIENTE: DatosInspeccion = {
  id: 'ins-1',
  numeroExpediente: 'EXP-2026-000001',
  tipo: 'PREVIA',
  estado: 'PENDIENTE',
  inspectorId: null,
  programadaPara: null,
  resultado: null,
  observaciones: null,
  numeroCertificado: null,
  certificadoEmitidoEn: null,
  registradaEn: null,
};

const asignada = () =>
  Inspeccion.reconstruir(PENDIENTE).asignar(INSPECTOR, '2026-11-21', '2026-11-20');

const registrar = (cambios: Partial<Parameters<Inspeccion['registrarResultado']>[0]> = {}) =>
  asignada().registrarResultado({
    inspectorId: INSPECTOR,
    resultado: 'FAVORABLE',
    observaciones: null,
    numeroCertificado: ' itse-001 / 2026 ',
    certificadoEmitidoEn: '2026-11-20',
    cantidadFotos: 2,
    hoy: '2026-11-20',
    en: EN,
    ...cambios,
  });

const errorDe = (accion: () => unknown) => {
  try {
    accion();
  } catch (error) {
    return error;
  }
  throw new Error('esperaba un error');
};

describe('Inspección ITSE (FR-008 a FR-012 de la 006)', () => {
  it('se asigna con inspector y fecha, y se puede reasignar sin resultado', () => {
    const inspeccion = asignada();

    expect(inspeccion.aDatos()).toMatchObject({
      estado: 'ASIGNADA',
      inspectorId: INSPECTOR,
      programadaPara: '2026-11-21',
    });
    expect(inspeccion.asignar('otro', '2026-11-20', '2026-11-20').aDatos().inspectorId).toBe(
      'otro',
    );
    expect(inspeccion.id).toBe('ins-1');
  });

  it('no se asigna con fecha pasada ni con resultado', () => {
    expect(
      errorDe(() =>
        Inspeccion.reconstruir(PENDIENTE).asignar(INSPECTOR, '2026-11-19', '2026-11-20'),
      ),
    ).toBeInstanceOf(ErrorDatoInspeccion);
    expect(
      errorDe(() => registrar().asignar(INSPECTOR, '2026-11-25', '2026-11-20')),
    ).toBeInstanceOf(ErrorInspeccionYaRegistrada);
  });

  it('el asignado registra FAVORABLE con el certificado normalizado, una sola vez', () => {
    const registrada = registrar();

    expect(registrada.aDatos()).toMatchObject({
      estado: 'REALIZADA',
      resultado: 'FAVORABLE',
      numeroCertificado: 'ITSE-001/2026',
      certificadoEmitidoEn: '2026-11-20',
      registradaEn: EN,
      observaciones: null,
    });
    expect(
      errorDe(() =>
        registrada.registrarResultado({
          inspectorId: INSPECTOR,
          resultado: 'FAVORABLE',
          observaciones: null,
          numeroCertificado: 'X-123',
          certificadoEmitidoEn: '2026-11-20',
          cantidadFotos: 1,
          hoy: '2026-11-20',
          en: EN,
        }),
      ),
    ).toBeInstanceOf(ErrorInspeccionYaRegistrada);
  });

  it('otro inspector o una inspección sin asignar no registran', () => {
    expect(errorDe(() => registrar({ inspectorId: 'otro' }))).toBeInstanceOf(
      ErrorNoEsInspectorAsignado,
    );
    expect(
      errorDe(() =>
        Inspeccion.reconstruir(PENDIENTE).registrarResultado({
          inspectorId: INSPECTOR,
          resultado: 'DESFAVORABLE',
          observaciones: 'Sin extintores',
          numeroCertificado: null,
          certificadoEmitidoEn: null,
          cantidadFotos: 1,
          hoy: '2026-11-20',
          en: EN,
        }),
      ),
    ).toBeInstanceOf(ErrorNoEsInspectorAsignado);
  });

  it.each([
    [{ cantidadFotos: 0 }, 'fotos'],
    [{ cantidadFotos: 6 }, 'fotos'],
    [{ resultado: 'DESFAVORABLE' as const, observaciones: '   ' }, 'observaciones'],
    [{ observaciones: 'x'.repeat(4001) }, 'observaciones'],
    [{ numeroCertificado: null }, 'numeroCertificado'],
    [{ certificadoEmitidoEn: null }, 'numeroCertificado'],
    [{ certificadoEmitidoEn: '2026-11-21' }, 'certificadoEmitidoEn'],
    [{ numeroCertificado: 'AB' }, 'numeroCertificado'],
  ])('%j es un dato inválido de %s', (cambios, campo) => {
    const error = errorDe(() => registrar(cambios));

    expect(error).toBeInstanceOf(ErrorDatoInspeccion);
    expect((error as ErrorDatoInspeccion).campo).toBe(campo);
  });

  it('DESFAVORABLE guarda las observaciones y no el certificado', () => {
    const registrada = registrar({
      resultado: 'DESFAVORABLE',
      observaciones: '  Sin extintores en el local  ',
    });

    expect(registrada.aDatos()).toMatchObject({
      resultado: 'DESFAVORABLE',
      observaciones: 'Sin extintores en el local',
      numeroCertificado: null,
      certificadoEmitidoEn: null,
    });
  });

  it('normaliza el número del certificado', () => {
    expect(normalizarNumeroCertificado('itse 2026-0001')).toBe('ITSE2026-0001');
    expect(() => normalizarNumeroCertificado('ITSE#1')).toThrow(ErrorDatoInspeccion);
  });
});
