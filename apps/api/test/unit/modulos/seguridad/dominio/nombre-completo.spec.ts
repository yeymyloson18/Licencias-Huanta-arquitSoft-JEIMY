import { ErrorDominio } from '../../../../../src/modulos/seguridad/dominio/error-dominio';
import { NombreCompleto } from '../../../../../src/modulos/seguridad/dominio/nombre-completo';

describe('NombreCompleto', () => {
  it('quita los espacios al inicio y al final', () => {
    expect(NombreCompleto.crear('  Ana Pérez Quispe ').valor).toBe('Ana Pérez Quispe');
  });

  it('acepta de 3 a 150 caracteres', () => {
    expect(NombreCompleto.crear('Ana').valor).toBe('Ana');
    expect(NombreCompleto.crear('a'.repeat(150)).valor).toHaveLength(150);
  });

  it.each(['', '  ', 'Al', 'a'.repeat(151)])('rechaza "%s"', (texto) => {
    expect(() => NombreCompleto.crear(texto)).toThrow(ErrorDominio);
  });
});
