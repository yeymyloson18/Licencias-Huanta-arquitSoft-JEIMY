import { CodigoReceta } from '../../../../../src/modulos/catalogo/dominio/codigo-receta';
import { ErrorDominio } from '../../../../../src/modulos/catalogo/dominio/error-dominio';

describe('CodigoReceta', () => {
  it.each([
    'LIC-01',
    'LIC-02',
    'LIC-03',
    'LIC-04',
    'LIC-05',
    'LIC-06',
    'LIC-07',
    'LIC-08',
    'LIC-09',
    'TRF-01',
    'CGI-01',
    'DUP-01',
  ])('acepta %s', (codigo) => {
    expect(CodigoReceta.crear(codigo).valor).toBe(codigo);
  });

  it.each(['LIC-10', 'LIC-00', 'lic-01', '', 'LIC-1', 'TRF-02', ' LIC-01'])(
    'rechaza %p',
    (codigo) => {
      expect(() => CodigoReceta.crear(codigo)).toThrow(ErrorDominio);
    },
  );
});
