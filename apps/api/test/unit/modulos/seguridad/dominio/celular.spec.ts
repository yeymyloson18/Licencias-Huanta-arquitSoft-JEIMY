import { Celular } from '../../../../../src/modulos/seguridad/dominio/celular';
import { ErrorDominio } from '../../../../../src/modulos/seguridad/dominio/error-dominio';

describe('Celular', () => {
  it('acepta 9 dígitos que empiezan con 9', () => {
    expect(Celular.crear('987654321').valor).toBe('987654321');
  });

  it('se muestra enmascarado como 9*****321 (FR-028)', () => {
    expect(Celular.crear('987654321').enmascarado()).toBe('9*****321');
  });

  it.each(['887654321', '98765432', '9876543210', '98765432a', ' 987654321', ''])(
    'rechaza "%s" sin repetir el valor',
    (texto) => {
      const intentar = () => Celular.crear(texto);

      expect(intentar).toThrow(ErrorDominio);
      if (texto.trim().length > 0) {
        expect(intentar).not.toThrow(texto.trim());
      }
    },
  );
});
