import { ErrorDominio } from '../../../../../src/modulos/catalogo/dominio/error-dominio';
import {
  crearReceta,
  esRuta,
  esTipoReceta,
  type DatosReceta,
} from '../../../../../src/modulos/catalogo/dominio/receta';

const licencia: DatosReceta = {
  codigo: 'LIC-01',
  nombre: 'Licencia de funcionamiento – riesgo bajo',
  tipo: 'LICENCIA',
  ruta: 'A',
  tasa: '159.50',
  plazoDias: 2,
};

describe('crearReceta', () => {
  it('crea una licencia con sus objetos de valor', () => {
    const receta = crearReceta(licencia);

    expect(receta.codigo.valor).toBe('LIC-01');
    expect(receta.nombre).toBe(licencia.nombre);
    expect(receta.tipo).toBe('LICENCIA');
    expect(receta.ruta).toBe('A');
    expect(receta.tasa.aTextoSoles()).toBe('159.50');
    expect(receta.plazoDias?.dias).toBe(2);
  });

  it('acepta un trámite conectado sin ruta ni plazo', () => {
    const receta = crearReceta({
      codigo: 'TRF-01',
      nombre: 'Transferencia de licencia o cambio de denominación',
      tipo: 'TRAMITE_CONECTADO',
      ruta: null,
      tasa: '45.10',
      plazoDias: null,
    });

    expect(receta.ruta).toBeNull();
    expect(receta.plazoDias).toBeNull();
  });

  it('exige ruta si es una licencia', () => {
    expect(() => crearReceta({ ...licencia, ruta: null })).toThrow(ErrorDominio);
  });

  it('acepta un nombre de 150 caracteres y rechaza uno de 151', () => {
    expect(crearReceta({ ...licencia, nombre: 'a'.repeat(150) }).nombre).toHaveLength(150);
    expect(() => crearReceta({ ...licencia, nombre: 'a'.repeat(151) })).toThrow(ErrorDominio);
  });

  it.each(['', '   '])('rechaza un nombre vacío (%p)', (nombre) => {
    expect(() => crearReceta({ ...licencia, nombre })).toThrow(ErrorDominio);
  });

  it('valida el código, la tasa y el plazo', () => {
    expect(() => crearReceta({ ...licencia, codigo: 'LIC-10' })).toThrow(ErrorDominio);
    expect(() => crearReceta({ ...licencia, tasa: '-1.00' })).toThrow(ErrorDominio);
    expect(() => crearReceta({ ...licencia, plazoDias: 0 })).toThrow(ErrorDominio);
  });
});

describe('esTipoReceta y esRuta', () => {
  it.each(['LICENCIA', 'TRAMITE_CONECTADO'])('%s es un tipo de receta', (valor) => {
    expect(esTipoReceta(valor)).toBe(true);
  });

  it.each(['licencia', 'OTRO', '', null, undefined, 1])('%p no es un tipo de receta', (valor) => {
    expect(esTipoReceta(valor)).toBe(false);
  });

  it.each(['A', 'B', 'C'])('%s es una ruta', (valor) => {
    expect(esRuta(valor)).toBe(true);
  });

  it.each(['D', 'a', '', null])('%p no es una ruta', (valor) => {
    expect(esRuta(valor)).toBe(false);
  });
});
