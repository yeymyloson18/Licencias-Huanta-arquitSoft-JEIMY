import { extraerCifras, normalizar } from '../../../../../src/modulos/orientacion/dominio/cifras';
import { seleccionarContexto } from '../../../../../src/modulos/orientacion/dominio/seleccionar-contexto';
import { GuiaOrientacionArchivo } from '../../../../../src/modulos/orientacion/infraestructura/guia-orientacion-archivo';
import { LICENCIAS, TEMAS } from './licencias-de-prueba';

// research R-04 de la 012: el contexto que se envía al proveedor es acotado (cuota del nivel
// gratuito). Siempre van todas las licencias en una tabla compacta, más hasta 2 recetas con detalle y
// hasta 4 temas de la guía, elegidos por coincidencia de palabras.

const contexto = (pregunta: string, historial: readonly string[] = []) =>
  seleccionarContexto(
    pregunta,
    historial.map((texto) => ({ rol: 'PERSONA' as const, texto })),
    LICENCIAS,
    TEMAS,
  );

const codigos = (pregunta: string, historial?: readonly string[]) =>
  contexto(pregunta, historial).detalle.map((licencia) => licencia.codigo);
const temas = (pregunta: string) => contexto(pregunta).temas.map((tema) => tema.id);

describe('normalizar', () => {
  it('quita tildes, mayúsculas y signos', () => {
    expect(normalizar('¿Cuánto CUESTA la Bódega, señor?')).toBe('cuanto cuesta la bodega senor');
  });
});

describe('seleccionarContexto', () => {
  it('"¿cuánto cuesta la licencia para una bodega?" lleva el detalle de la receta de bodega', () => {
    expect(codigos('¿Cuánto cuesta la licencia para una bodega?')).toContain('LIC-09');
  });

  it.each(['BODEGA', 'bódega', 'bodegas'])('normaliza "%s" sin tildes ni mayúsculas', (palabra) => {
    expect(codigos(`licencia para ${palabra}`)).toContain('LIC-09');
  });

  it('"riesgo alto" prefiere la receta de riesgo alto a la de muy alto', () => {
    expect(codigos('¿cuánto cuesta la de riesgo alto?')[0]).toBe('LIC-03');
  });

  it('reconoce el código de la receta', () => {
    expect(codigos('¿qué pide la LIC-06?')).toEqual(['LIC-06']);
  });

  it('una pregunta de seguimiento usa el historial de la conversación', () => {
    expect(codigos('¿y cuánto demora?', ['quiero abrir una bodega'])).toContain('LIC-09');
  });

  it('"¿cómo pago?" lleva el tema de pago', () => {
    expect(temas('¿Cómo pago?')).toContain('pago');
  });

  it('sin coincidencias lleva los temas generales y ninguna receta en detalle', () => {
    const resultado = contexto('hola, buenas tardes');

    expect(resultado.temas.map((tema) => tema.id)).toEqual(['rutas', 'presentar', 'consultar']);
    expect(resultado.temaPrincipal).toBeNull();
    expect(resultado.detalle).toEqual([]);
  });

  it('el tema principal es el que más coincide', () => {
    expect(contexto('quiero hacer una transferencia de licencia').temaPrincipal?.id).toBe(
      'tramites-no-atendidos',
    );
  });

  it('siempre lleva todas las licencias vigentes en la tabla', () => {
    expect(contexto('¿cómo pago?').licencias).toEqual(LICENCIAS);
  });

  it('lleva como máximo 2 recetas en detalle y 4 temas', () => {
    const resultado = contexto(
      'licencia riesgo medio, cesionarios, bodega; ruta, pago, presentar, subsanar, consultar, itse',
    );

    expect(resultado.detalle.length).toBeLessThanOrEqual(2);
    expect(resultado.temas.length).toBeLessThanOrEqual(4);
  });

  it('las cifras permitidas incluyen tasas, plazos y vigencias de TODA la tabla y de los temas', () => {
    const { cifrasPermitidas } = contexto('¿cómo subsano?');

    for (const cifra of ['159.50', '177.10', '538.90', '0.00', '2 dias', '8 dias', '9 dias']) {
      expect(cifrasPermitidas.has(cifra)).toBe(true);
    }
    expect(cifrasPermitidas.has('12 meses')).toBe(true);
    // Del tema "subsanar" elegido.
    expect(cifrasPermitidas.has('2 dias')).toBe(true);
    expect(cifrasPermitidas.has('999.99')).toBe(false);
  });

  it('incluye las cifras de los requisitos de las recetas en detalle', () => {
    const conPlazo = LICENCIAS.map((licencia) =>
      licencia.codigo === 'LIC-09'
        ? { ...licencia, requisitos: ['Planos de hace menos de 5 años'] }
        : licencia,
    );

    expect(seleccionarContexto('bodega', [], conPlazo, TEMAS).cifrasPermitidas.has('5 anos')).toBe(
      true,
    );
  });
});

describe('extraerCifras', () => {
  it.each([
    ['S/ 123.45', ['123.45']],
    ['S/. 123', ['123.00']],
    ['S/123', ['123.00']],
    ['123.45 soles', ['123.45']],
    ['S/ 177.1', ['177.10']],
    ['S/ 1,234.50', ['1234.50']],
    ['15 días', ['15 dias']],
    ['15 días hábiles', ['15 dias']],
    ['30 días calendario', ['30 dias']],
    ['1 día', ['1 dias']],
    ['12 meses', ['12 meses']],
    ['1 mes', ['1 meses']],
    ['2 años', ['2 anos']],
  ])('"%s" → %j', (texto, esperado) => {
    expect(extraerCifras(texto)).toEqual(esperado);
  });

  it.each(['LIC-02', 'el TUPA 2024', 'paso 3', 'EXP-2026-000123', 'hasta 50 m²'])(
    '"%s" no tiene montos ni plazos',
    (texto) => {
      expect(extraerCifras(texto)).toEqual([]);
    },
  );
});

// Corrección de la 012 (FR-027 a FR-030): la conversación real que falló el 2026-11-24.
describe('seleccionarContexto: conversación real (corrección de la 012)', () => {
  interface Turno {
    rol: 'PERSONA' | 'ORIENTADOR';
    texto: string;
    codigosReceta?: string[];
  }
  const detalleDe = (pregunta: string, historial: Turno[]) =>
    seleccionarContexto(pregunta, historial, LICENCIAS, TEMAS).detalle.map((l) => l.codigo);

  const conversacion: Turno[] = [
    { rol: 'PERSONA', texto: 'que documentos tengo que presentar' },
    {
      rol: 'ORIENTADOR',
      texto: '¿Para qué tipo de negocio es? Con eso le digo los requisitos de su licencia.',
    },
    { rol: 'PERSONA', texto: 'par ala categoria mas basica' },
    {
      rol: 'ORIENTADOR',
      texto: 'La más básica es la licencia de funcionamiento de riesgo bajo.',
      codigosReceta: ['LIC-01'],
    },
  ];

  it('"par ala categoria mas basica" se entiende como riesgo bajo (LIC-01)', () => {
    expect(detalleDe('par ala categoria mas basica', conversacion.slice(0, 2))[0]).toBe('LIC-01');
  });

  it('"cuales son esos documento requeridos" usa la licencia de la respuesta anterior (codigosReceta)', () => {
    expect(detalleDe('cuales son esos documento requeridos', conversacion)[0]).toBe('LIC-01');
  });

  it('también reconoce un código LIC-xx escrito en el texto de una respuesta anterior', () => {
    const historial: Turno[] = [
      { rol: 'PERSONA', texto: 'hola' },
      { rol: 'ORIENTADOR', texto: 'Le corresponde la LIC-06, para cesionarios.' },
    ];

    expect(detalleDe('¿y qué papeles piden?', historial)[0]).toBe('LIC-06');
  });

  it('entre dos respuestas anteriores gana la más reciente', () => {
    const historial: Turno[] = [
      { rol: 'ORIENTADOR', texto: 'Esa es la de riesgo medio.', codigosReceta: ['LIC-02'] },
      { rol: 'PERSONA', texto: '¿y la otra?' },
      { rol: 'ORIENTADOR', texto: 'Esa es la de riesgo alto.', codigosReceta: ['LIC-03'] },
    ];

    expect(detalleDe('¿qué requisitos tiene?', historial)[0]).toBe('LIC-03');
  });

  it('la pregunta actual que nombra otra licencia gana a las respuestas anteriores', () => {
    const historial: Turno[] = [
      { rol: 'ORIENTADOR', texto: 'Es la de riesgo bajo.', codigosReceta: ['LIC-01'] },
    ];

    expect(detalleDe('¿y para una bodega?', historial)[0]).toBe('LIC-09');
  });

  it('ignora los códigos que no son licencias vigentes', () => {
    const historial: Turno[] = [
      { rol: 'ORIENTADOR', texto: 'Vea la TRF-01.', codigosReceta: ['TRF-01', 'LIC-99'] },
    ];

    expect(detalleDe('¿qué requisitos tiene?', historial)).toEqual([]);
  });

  it.each(['tienda', 'abarrotes', 'tiendita de abarrotes'])('"%s" → bodega (LIC-09)', (texto) => {
    expect(detalleDe(`licencia para una ${texto}`, [])).toContain('LIC-09');
  });

  it.each(['mas simple', 'pequeño negocio', 'la más básica'])(
    '"%s" → riesgo bajo (LIC-01)',
    (texto) => {
      expect(detalleDe(`quiero la ${texto}`, [])[0]).toBe('LIC-01');
    },
  );

  it.each([
    'que documentos tengo que presentar',
    'cuales son esos documento requeridos',
    '¿qué papeles piden?',
    '¿cuáles son los requisitos?',
  ])('"%s" pide requisitos', (pregunta) => {
    expect(seleccionarContexto(pregunta, [], LICENCIAS, TEMAS).pideRequisitos).toBe(true);
  });

  it.each(['¿cuánto cuesta?', 'que es el tupa', '¿cómo pago?'])(
    '"%s" no pide requisitos',
    (pregunta) => {
      expect(seleccionarContexto(pregunta, [], LICENCIAS, TEMAS).pideRequisitos).toBe(false);
    },
  );

  it('con la guía real, "que es el tupa" tiene como tema principal "¿Qué es el TUPA?"', () => {
    const temas = new GuiaOrientacionArchivo().temas();

    expect(seleccionarContexto('que es el tupa', [], LICENCIAS, temas).temaPrincipal?.id).toBe(
      'tupa',
    );
  });
});
