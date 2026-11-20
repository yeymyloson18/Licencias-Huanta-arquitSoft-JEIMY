import { ErrorDominio } from '../../../../../src/modulos/tramites/dominio/error-dominio';
import { NumeroExpediente } from '../../../../../src/modulos/tramites/dominio/numero-expediente';

describe('NumeroExpediente (FR-016, aclaración 4)', () => {
  it('crea EXP-2026-000001 a partir del año y el correlativo', () => {
    expect(NumeroExpediente.crear(2026, 1).valor).toBe('EXP-2026-000001');
  });

  it('el correlativo no se reinicia al cambiar de año', () => {
    expect(NumeroExpediente.crear(2027, 154).valor).toBe('EXP-2027-000154');
  });

  it('acepta el correlativo máximo de 6 cifras', () => {
    expect(NumeroExpediente.crear(2026, 999_999).valor).toBe('EXP-2026-999999');
  });

  it.each([0, -1, 1.5, 1_000_000])('rechaza el correlativo %p', (correlativo) => {
    expect(() => NumeroExpediente.crear(2026, correlativo)).toThrow(ErrorDominio);
  });

  it.each([999, 10_000, 2026.5])('rechaza el año %p', (anio) => {
    expect(() => NumeroExpediente.crear(anio, 1)).toThrow(ErrorDominio);
  });

  it('normaliza espacios y minúsculas', () => {
    expect(NumeroExpediente.normalizar(' exp-2026-000001 ').valor).toBe('EXP-2026-000001');
  });

  it.each(['EXP-26-1', 'EXP-2026-0000001', 'EXP-2026-00001', 'LIC-2026-000001', '', '   '])(
    'rechaza %p',
    (texto) => {
      expect(() => NumeroExpediente.normalizar(texto)).toThrow(ErrorDominio);
    },
  );

  it('el mensaje de error no repite el texto recibido', () => {
    expect(() => NumeroExpediente.normalizar('dato-secreto')).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('dato-secreto') as string }),
    );
  });

  it('compara por valor', () => {
    expect(
      NumeroExpediente.crear(2026, 7).esIgualA(NumeroExpediente.normalizar('exp-2026-000007')),
    ).toBe(true);
  });
});
