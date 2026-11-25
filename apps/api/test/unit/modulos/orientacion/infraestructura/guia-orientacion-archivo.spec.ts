import guiaReal from '../../../../../src/modulos/orientacion/infraestructura/guia/guia-orientacion.json';
import {
  ErrorGuiaInvalida,
  GuiaOrientacionArchivo,
} from '../../../../../src/modulos/orientacion/infraestructura/guia-orientacion-archivo';

// research R-03 de la 012: la guía de preguntas frecuentes es un JSON validado al arrancar. Si es
// inválida, la API no arranca.

const tema = (cambios: Record<string, unknown> = {}) => ({
  id: 'pago',
  titulo: 'Cómo se paga',
  palabrasClave: ['pago'],
  respuesta: 'En la caja de la Municipalidad.',
  enlaces: ['CONSULTA'],
  ...cambios,
});

const errorDe = (datos: unknown): ErrorGuiaInvalida => {
  try {
    new GuiaOrientacionArchivo(datos);
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorGuiaInvalida);
    return error as ErrorGuiaInvalida;
  }
  throw new Error('Se esperaba ErrorGuiaInvalida');
};

describe('GuiaOrientacionArchivo', () => {
  it('carga la guía real del módulo', () => {
    const temas = new GuiaOrientacionArchivo().temas();

    expect(temas.length).toBeGreaterThanOrEqual(10);
    expect(temas.map((t) => t.id)).toEqual(
      expect.arrayContaining([
        'rutas',
        'itse',
        'pago',
        'estados',
        'presentar',
        'subsanar',
        'consultar',
        'calificacion',
        'vigencia',
        'tramites-no-atendidos',
      ]),
    );
  });

  it('el tema de trámites no atendidos dice que no se atienden en este sistema (I2 del análisis)', () => {
    const tramites = new GuiaOrientacionArchivo()
      .temas()
      .find((t) => t.id === 'tramites-no-atendidos');

    expect(tramites?.respuesta).toMatch(/transferencia/i);
    expect(tramites?.respuesta).toMatch(/cambio de giro/i);
    expect(tramites?.respuesta).toMatch(/duplicado/i);
    expect(tramites?.respuesta).toContain('no se atienden en este sistema');
  });

  it('la guía no repite tasas en soles: esas cifras salen del catálogo vigente', () => {
    const texto = JSON.stringify(guiaReal.temas);

    expect(texto).not.toMatch(/S\/\.?\s?\d/);
    expect(texto).not.toMatch(/\d+(?:[.,]\d+)?\s*soles/i);
  });

  it('acepta un tema sin enlaces (lista vacía)', () => {
    expect(
      new GuiaOrientacionArchivo({ temas: [tema({ enlaces: undefined })] }).temas()[0]?.enlaces,
    ).toEqual([]);
  });

  it.each([
    ['un id con mayúsculas', { id: 'Pago' }],
    ['un id de 2 caracteres', { id: 'pa' }],
    ['un id de 41 caracteres', { id: 'a'.repeat(41) }],
    ['un título vacío', { titulo: '' }],
    ['un título de 121 caracteres', { titulo: 'a'.repeat(121) }],
    ['sin palabras clave', { palabrasClave: [] }],
    ['21 palabras clave', { palabrasClave: Array.from({ length: 21 }, (_, i) => `p${String(i)}`) }],
    ['una respuesta vacía', { respuesta: '' }],
    ['una respuesta de 1,501 caracteres', { respuesta: 'a'.repeat(1501) }],
    ['un enlace desconocido', { enlaces: ['WEB'] }],
    ['un campo de más', { url: 'https://example.com' }],
  ])('rechaza %s', (_caso, cambios) => {
    expect(errorDe({ temas: [tema(cambios)] }).message).toContain('guía de orientación');
  });

  it('rechaza ids repetidos, una guía vacía y datos que no son una guía', () => {
    errorDe({ temas: [tema(), tema()] });
    errorDe({ temas: [] });
    errorDe(null);
    errorDe('texto');
  });
});
