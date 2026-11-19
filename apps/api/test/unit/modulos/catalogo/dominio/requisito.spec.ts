import { ErrorDominio } from '../../../../../src/modulos/catalogo/dominio/error-dominio';
import {
  CONDICIONES_REQUISITO,
  crearRequisito,
  esCondicionRequisito,
  type DatosRequisito,
} from '../../../../../src/modulos/catalogo/dominio/requisito';

const datos: DatosRequisito = {
  id: 7,
  orden: 1,
  descripcion: 'Declaración jurada de condiciones de seguridad',
  obligatorio: true,
  condicion: 'SIEMPRE',
};

describe('crearRequisito', () => {
  it.each(CONDICIONES_REQUISITO)('acepta la condición %s', (condicion) => {
    expect(crearRequisito({ ...datos, condicion }).condicion).toBe(condicion);
  });

  it('rechaza una condición desconocida', () => {
    expect(() => crearRequisito({ ...datos, condicion: 'A_VECES' })).toThrow(ErrorDominio);
    expect(esCondicionRequisito('A_VECES')).toBe(false);
  });

  it('recorta los espacios al inicio y al final de la descripción', () => {
    expect(crearRequisito({ ...datos, descripcion: '  Plan de seguridad  ' }).descripcion).toBe(
      'Plan de seguridad',
    );
  });

  it('rechaza una descripción vacía o de solo espacios', () => {
    expect(() => crearRequisito({ ...datos, descripcion: '' })).toThrow(ErrorDominio);
    expect(() => crearRequisito({ ...datos, descripcion: '   ' })).toThrow(ErrorDominio);
  });

  it('acepta 500 caracteres (tras recortar) y rechaza 501', () => {
    expect(
      crearRequisito({ ...datos, descripcion: ` ${'a'.repeat(500)} ` }).descripcion,
    ).toHaveLength(500);
    expect(() => crearRequisito({ ...datos, descripcion: 'a'.repeat(501) })).toThrow(
      'no puede superar 500 caracteres',
    );
  });

  it('acepta un requisito nuevo (id null) y rechaza un id que no es entero positivo', () => {
    expect(crearRequisito({ ...datos, id: null }).id).toBeNull();
    expect(() => crearRequisito({ ...datos, id: 0 })).toThrow(ErrorDominio);
    expect(() => crearRequisito({ ...datos, id: 1.5 })).toThrow(ErrorDominio);
  });

  it('exige un orden entero mayor o igual a 1', () => {
    expect(() => crearRequisito({ ...datos, orden: 0 })).toThrow(ErrorDominio);
    expect(() => crearRequisito({ ...datos, orden: 2.5 })).toThrow(ErrorDominio);
  });

  it('conserva si es obligatorio y queda inmutable', () => {
    const requisito = crearRequisito({ ...datos, obligatorio: false });
    expect(requisito.obligatorio).toBe(false);
    expect(Object.isFrozen(requisito)).toBe(true);
  });
});
