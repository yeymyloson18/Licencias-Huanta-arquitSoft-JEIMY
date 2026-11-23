import {
  codigoDesdeBytes,
  esCodigoVerificacion,
} from '../../../../../src/modulos/licencias/dominio/codigo-verificacion';
import {
  crearCertificado,
  type DatosExpedienteParaLicencia,
  Licencia,
  numeroLicencia,
} from '../../../../../src/modulos/licencias/dominio/licencia';
import { titularPublico } from '../../../../../src/compartido/dominio/titular-publico';

// Datos FICTICIOS.
const EXPEDIENTE: DatosExpedienteParaLicencia = {
  numeroExpediente: 'EXP-2026-000001',
  codigoReceta: 'LIC-09',
  nombreComercial: 'Bodega Doña Juana',
  giro: 'Bodega',
  zona: 'Centro',
  razonSocial: null,
  nombreTitular: 'Juana Pérez Quispe',
  vigenciaMeses: 12,
};
const EN = new Date('2026-11-20T15:00:00.000Z');
const CODIGO = 'AAAAAAAAAAAAAAAAAAAAAA';

const emitir = (cambios: Partial<Parameters<typeof Licencia.emitir>[0]> = {}) =>
  Licencia.emitir({
    correlativo: 7,
    codigoVerificacion: CODIGO,
    tipo: 'PROVISIONAL',
    expediente: EXPEDIENTE,
    certificado: null,
    en: EN,
    ...cambios,
  });

describe('Licencia (HU06, FR-014 a FR-016 de la 006)', () => {
  it('número LF-AAAA-NNNNNN con el año de Lima', () => {
    expect(numeroLicencia(EN, 7)).toBe('LF-2026-000007');
    expect(numeroLicencia(new Date('2027-01-01T04:00:00.000Z'), 1)).toBe('LF-2026-000001');
  });

  it('la provisional vence a los 12 meses de la receta; la definitiva no vence', () => {
    expect(emitir().aDatos().vigenteHasta).toBe('2027-11-20');
    expect(
      emitir({ expediente: { ...EXPEDIENTE, vigenciaMeses: null } }).aDatos().vigenteHasta,
    ).toBe('2027-11-20');
    expect(emitir({ tipo: 'DEFINITIVA' }).aDatos().vigenteHasta).toBeNull();
  });

  it('publica el titular abreviado y nunca otro dato del titular', () => {
    const datos = emitir().aDatos();

    expect(datos).toMatchObject({
      numero: 'LF-2026-000007',
      titularPublico: 'Juana P. Q.',
      giro: 'Bodega',
      zona: 'Centro',
      nombreComercial: 'Bodega Doña Juana',
      codigoVerificacion: CODIGO,
    });
    expect(JSON.stringify(datos)).not.toContain('Pérez');
  });

  it('VENCIDA cuando la vigencia ya pasó, al leer', () => {
    const licencia = emitir();

    expect(licencia.estadoEn('2027-11-20')).toBe('VIGENTE');
    expect(licencia.estadoEn('2027-11-21')).toBe('VENCIDA');
    expect(emitir({ tipo: 'DEFINITIVA' }).estadoEn('2099-01-01')).toBe('VIGENTE');
  });

  it('el certificado ITSE vence 2 años después y su estado se calcula al leer', () => {
    const licencia = emitir({
      tipo: 'DEFINITIVA',
      certificado: { numero: 'ITSE-001-2026', emitidoEn: '2026-11-19' },
    });

    expect(licencia.aDatos().certificado).toEqual({
      numero: 'ITSE-001-2026',
      emitidoEn: '2026-11-19',
      venceEn: '2028-11-19',
    });
    expect(licencia.itseEstadoEn('2028-11-19')).toBe('VIGENTE');
    expect(licencia.itseEstadoEn('2028-11-20')).toBe('VENCIDO');
    expect(emitir().itseEstadoEn('2026-11-20')).toBe('SIN_CERTIFICADO');
    expect(crearCertificado('X-1', '2028-02-29').venceEn).toBe('2030-02-28');
  });

  it('reconstruir conserva los datos', () => {
    const datos = emitir().aDatos();

    expect(Licencia.reconstruir(datos).aDatos()).toEqual(datos);
    expect(Licencia.reconstruir(datos).numero).toBe('LF-2026-000007');
    expect(Licencia.reconstruir(datos).numeroExpediente).toBe('EXP-2026-000001');
  });
});

describe('Titular público (research §R-11 de la 006)', () => {
  it.each([
    [
      { razonSocial: 'Comercial Huanta S.A.C.', nombreTitular: 'Juana Pérez' },
      'Comercial Huanta S.A.C.',
    ],
    [{ razonSocial: '  ', nombreTitular: 'Juana Pérez Quispe' }, 'Juana P. Q.'],
    [{ razonSocial: null, nombreTitular: '  Ana   de la Cruz ' }, 'Ana D. L. C.'],
    [{ razonSocial: null, nombreTitular: 'Rosa' }, 'Rosa'],
  ])('%j → %s', (datos, esperado) => {
    expect(titularPublico(datos)).toBe(esperado);
  });
});

describe('Código de verificación (research §R-10 de la 006)', () => {
  it('16 bytes → 22 caracteres base64url', () => {
    const codigo = codigoDesdeBytes(new Uint8Array(16).fill(255));

    expect(codigo).toHaveLength(22);
    expect(esCodigoVerificacion(codigo)).toBe(true);
  });

  it('rechaza otro largo de bytes y códigos mal formados', () => {
    expect(() => codigoDesdeBytes(new Uint8Array(8))).toThrow();
    expect(esCodigoVerificacion('corto')).toBe(false);
    expect(esCodigoVerificacion('A'.repeat(21) + '!')).toBe(false);
  });
});
