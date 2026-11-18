import { leerCampo } from '../../../../../src/modulos/seguridad/aplicacion/leer-campos';
import { ErrorDominio } from '../../../../../src/modulos/seguridad/dominio/error-dominio';

describe('leerCampo', () => {
  it('devuelve el valor si se puede crear', () => {
    const invalidos: string[] = [];

    expect(leerCampo('nombre', invalidos, () => 'Ana')).toBe('Ana');
    expect(invalidos).toEqual([]);
  });

  it('ante un error de dominio anota el campo (sin su valor) y devuelve null', () => {
    const invalidos: string[] = [];

    const valor = leerCampo('celular', invalidos, () => {
      throw new ErrorDominio('Celular inválido');
    });

    expect(valor).toBeNull();
    expect(invalidos).toEqual(['celular']);
  });

  it('relanza los errores que no son de dominio', () => {
    expect(() =>
      leerCampo('celular', [], () => {
        throw new TypeError('fallo inesperado');
      }),
    ).toThrow(TypeError);
  });
});
