import { Correo } from '../../../../../src/modulos/seguridad/dominio/correo';
import { ErrorDominio } from '../../../../../src/modulos/seguridad/dominio/error-dominio';

describe('Correo', () => {
  it('normaliza a minúsculas y sin espacios', () => {
    expect(Correo.crear('  Ana.Perez@Ejemplo.PE ').valor).toBe('ana.perez@ejemplo.pe');
  });

  it('dos correos con distinta capitalización son iguales', () => {
    expect(Correo.crear('A@ejemplo.pe').esIgualA(Correo.crear('a@EJEMPLO.pe'))).toBe(true);
  });

  it.each(['', 'sin-arroba', 'a@b', 'a b@ejemplo.pe', '@ejemplo.pe', `${'a'.repeat(116)}@x.pe`])(
    'rechaza "%s" sin repetir el valor en el mensaje',
    (texto) => {
      const intentar = () => Correo.crear(texto);

      expect(intentar).toThrow(ErrorDominio);
      if (texto.length > 0) {
        expect(intentar).not.toThrow(texto);
      }
    },
  );
});
