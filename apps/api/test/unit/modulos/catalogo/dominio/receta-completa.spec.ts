import { ErrorDominio } from '../../../../../src/modulos/catalogo/dominio/error-dominio';
import {
  aDatosRecetaCompleta,
  crearRecetaCompleta,
  type DatosRecetaCompleta,
} from '../../../../../src/modulos/catalogo/dominio/receta-completa';
import { leerSemillaCatalogo } from '../apoyo/semilla-catalogo';

const semilla = leerSemillaCatalogo();
const datosDe = (codigo: string): DatosRecetaCompleta => {
  const datos = semilla.find((receta) => receta.codigo === codigo);
  if (!datos) throw new Error(`No está ${codigo} en la semilla`);
  return datos;
};

describe('crearRecetaCompleta', () => {
  it.each(semilla.map((datos) => [datos.codigo, datos] as const))(
    'construye %s de datos-semilla.sql',
    (codigo, datos) => {
      const receta = crearRecetaCompleta(datos);
      expect(receta.codigo.valor).toBe(codigo);
      expect(receta.tasa.aTextoSoles()).toBe(datos.tasa);
    },
  );

  it('conserva los requisitos de LIC-03 en orden (9 requisitos, ITSE previa)', () => {
    const receta = crearRecetaCompleta(datosDe('LIC-03'));

    expect(receta.requisitos.map((requisito) => requisito.orden)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(receta.requisitos[1]?.condicion).toBe('CON_REPRESENTANTE');
    expect(receta.calificacion).toBe('EVALUACION_PREVIA_SILENCIO_POSITIVO');
    expect(receta.ordenItse).toBe('PREVIA');
    expect(receta.plazoItseDias).toBe(7);
    expect(receta.vigenciaMeses).toBeNull();
  });

  it('ordena los requisitos por orden aunque lleguen desordenados', () => {
    const datos = datosDe('LIC-01');
    const receta = crearRecetaCompleta({ ...datos, requisitos: [...datos.requisitos].reverse() });

    expect(receta.requisitos.map((requisito) => requisito.orden)).toEqual([1, 2, 3, 4]);
  });

  it('lee la bodega: gratuita, ITSE dentro de 6 meses y provisional de 12 meses', () => {
    const receta = crearRecetaCompleta(datosDe('LIC-09'));

    expect(receta.tasa.esGratuita()).toBe(true);
    expect(receta.ordenItse).toBe('DENTRO_6_MESES');
    expect(receta.plazoItseDias).toBeNull();
    expect(receta.vigenciaMeses).toBe(12);
  });

  it('lee un trámite conectado sin ruta, sin ITSE y (en la semilla actual) sin requisitos', () => {
    const receta = crearRecetaCompleta(datosDe('TRF-01'));

    expect(receta.ruta).toBeNull();
    expect(receta.ordenItse).toBeNull();
    expect(receta.requisitos).toHaveLength(0);
  });

  it.each([
    ['calificacion', { calificacion: 'APROBACION_RAPIDA' }],
    ['tipoPlazo', { tipoPlazo: 'SEMANAS' }],
    ['ordenItse', { ordenItse: 'DURANTE' }],
    ['nivelRiesgo', { nivelRiesgo: 'EXTREMO' }],
    ['plazoItseDias', { plazoItseDias: 0 }],
    ['vigenciaMeses', { vigenciaMeses: 0 }],
    ['paginaTupa', { paginaTupa: 0 }],
    ['codigoTupa', { codigoTupa: '  ' }],
    ['actualizadaEn', { actualizadaEn: 'no es fecha' }],
    ['tasa', { tasa: '-1.00' }],
  ])('rechaza %s inválido', (_campo, cambio) => {
    expect(() => crearRecetaCompleta({ ...datosDe('LIC-02'), ...cambio })).toThrow(ErrorDominio);
  });

  it('rechaza un requisito inválido', () => {
    const datos = datosDe('LIC-02');
    expect(() =>
      crearRecetaCompleta({
        ...datos,
        requisitos: [
          { id: null, orden: 1, descripcion: ' ', obligatorio: true, condicion: 'SIEMPRE' },
        ],
      }),
    ).toThrow(ErrorDominio);
  });

  it('queda inmutable', () => {
    const receta = crearRecetaCompleta(datosDe('LIC-02'));
    expect(Object.isFrozen(receta)).toBe(true);
    expect(Object.isFrozen(receta.requisitos)).toBe(true);
  });
});

describe('aDatosRecetaCompleta', () => {
  it.each(semilla.map((datos) => [datos.codigo, datos] as const))(
    'es la operación inversa de crearRecetaCompleta para %s',
    (_codigo, datos) => {
      expect(aDatosRecetaCompleta(crearRecetaCompleta(datos))).toEqual(datos);
    },
  );
});
