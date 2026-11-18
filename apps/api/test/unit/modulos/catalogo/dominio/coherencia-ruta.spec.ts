import {
  COHERENCIA_POR_RUTA,
  verificarCoherencia,
  type DatosCoherencia,
} from '../../../../../src/modulos/catalogo/dominio/coherencia-ruta';
import { leerSemillaCatalogo } from '../apoyo/semilla-catalogo';

const licencia = (cambios: Partial<DatosCoherencia>): DatosCoherencia => ({
  tipo: 'LICENCIA',
  ruta: 'A',
  calificacion: 'APROBACION_AUTOMATICA',
  ordenItse: 'POSTERIOR',
  plazoItseDias: 9,
  vigenciaMeses: null,
  ...cambios,
});

const tramite = (cambios: Partial<DatosCoherencia>): DatosCoherencia => ({
  tipo: 'TRAMITE_CONECTADO',
  ruta: null,
  calificacion: 'APROBACION_AUTOMATICA',
  ordenItse: null,
  plazoItseDias: null,
  vigenciaMeses: null,
  ...cambios,
});

const campos = (datos: DatosCoherencia) => verificarCoherencia(datos).map((error) => error.campo);

describe('Coherencia de una receta con su ruta (COHERENCIA_POR_RUTA)', () => {
  it('la tabla es un dato del dominio con las 4 clases de receta', () => {
    expect(Object.keys(COHERENCIA_POR_RUTA)).toEqual(['A', 'B', 'C', 'TRAMITE_CONECTADO']);
  });

  describe('ruta A: APROBACION_AUTOMATICA + POSTERIOR + plazo del ITSE ≥ 1', () => {
    it('acepta la combinación válida, con vigencia indeterminada o ≥ 1', () => {
      expect(campos(licencia({}))).toEqual([]);
      expect(campos(licencia({ vigenciaMeses: 12 }))).toEqual([]);
    });
    it.each([
      [{ calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO' as const }, 'calificacion'],
      [{ calificacion: 'SERVICIO_EXCLUSIVO' as const }, 'calificacion'],
      [{ ordenItse: 'PREVIA' as const }, 'ordenItse'],
      [{ ordenItse: null }, 'ordenItse'],
      [{ plazoItseDias: null }, 'plazoItseDias'],
      [{ plazoItseDias: 0 }, 'plazoItseDias'],
    ])('rechaza %o en el campo %s', (cambio, campo) => {
      expect(campos(licencia(cambio))).toEqual([campo]);
    });
  });

  describe('ruta B: EVALUACION_PREVIA_SILENCIO_POSITIVO + PREVIA + plazo del ITSE ≥ 1', () => {
    const rutaB = (cambios: Partial<DatosCoherencia>) =>
      licencia({
        ruta: 'B',
        calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO',
        ordenItse: 'PREVIA',
        plazoItseDias: 7,
        ...cambios,
      });

    it('acepta la combinación válida', () => {
      expect(campos(rutaB({}))).toEqual([]);
    });
    it.each([
      [{ calificacion: 'APROBACION_AUTOMATICA' as const }, 'calificacion'],
      [{ ordenItse: 'POSTERIOR' as const }, 'ordenItse'],
      [{ plazoItseDias: null }, 'plazoItseDias'],
    ])('rechaza %o en el campo %s', (cambio, campo) => {
      expect(campos(rutaB(cambio))).toEqual([campo]);
    });
  });

  describe('ruta C: APROBACION_AUTOMATICA + DENTRO_6_MESES + plazo del ITSE vacío', () => {
    const rutaC = (cambios: Partial<DatosCoherencia>) =>
      licencia({
        ruta: 'C',
        ordenItse: 'DENTRO_6_MESES',
        plazoItseDias: null,
        vigenciaMeses: 12,
        ...cambios,
      });

    it('acepta la combinación válida', () => {
      expect(campos(rutaC({}))).toEqual([]);
    });
    it.each([
      [{ calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO' as const }, 'calificacion'],
      [{ ordenItse: 'POSTERIOR' as const }, 'ordenItse'],
      [{ plazoItseDias: 6 }, 'plazoItseDias'],
    ])('rechaza %o en el campo %s', (cambio, campo) => {
      expect(campos(rutaC(cambio))).toEqual([campo]);
    });
  });

  describe('trámite conectado: sin ITSE ni vigencia', () => {
    it.each(['APROBACION_AUTOMATICA', 'SERVICIO_EXCLUSIVO'] as const)(
      'acepta la calificación %s',
      (calificacion) => {
        expect(campos(tramite({ calificacion }))).toEqual([]);
      },
    );
    it.each([
      [{ calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO' as const }, 'calificacion'],
      [{ ordenItse: 'POSTERIOR' as const }, 'ordenItse'],
      [{ plazoItseDias: 3 }, 'plazoItseDias'],
      [{ vigenciaMeses: 12 }, 'vigenciaMeses'],
    ])('rechaza %o en el campo %s', (cambio, campo) => {
      expect(campos(tramite(cambio))).toEqual([campo]);
    });
  });

  it('informa todos los campos incoherentes a la vez', () => {
    expect(campos(tramite({ ordenItse: 'PREVIA', plazoItseDias: 7, vigenciaMeses: 1 }))).toEqual([
      'ordenItse',
      'plazoItseDias',
      'vigenciaMeses',
    ]);
  });

  it('una licencia sin ruta se informa sin fallar', () => {
    expect(campos(licencia({ ruta: null }))).toEqual(['ruta']);
  });

  it('las 12 recetas de datos-semilla.sql cumplen la tabla', () => {
    const recetas = leerSemillaCatalogo();

    expect(recetas).toHaveLength(12);
    for (const receta of recetas) {
      const errores = verificarCoherencia({
        tipo: receta.tipo,
        ruta: receta.ruta,
        calificacion: receta.calificacion as DatosCoherencia['calificacion'],
        ordenItse: receta.ordenItse as DatosCoherencia['ordenItse'],
        plazoItseDias: receta.plazoItseDias,
        vigenciaMeses: receta.vigenciaMeses,
      });
      expect({ codigo: receta.codigo, errores }).toEqual({ codigo: receta.codigo, errores: [] });
    }
  });
});
