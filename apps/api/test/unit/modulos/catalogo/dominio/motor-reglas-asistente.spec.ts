import {
  ErrorRespuestasInvalidas,
  proponerLicencia,
  validarRespuestas,
} from '../../../../../src/modulos/catalogo/dominio/motor-reglas-asistente';
import type { ReglaAsistente } from '../../../../../src/modulos/catalogo/dominio/pregunta-asistente';
import { leerSemillaAsistente } from '../apoyo/semilla-catalogo';

// Preguntas y reglas de datos-semilla.sql (propuesta pendiente de validar, duda N.° 2 del doc. 09).
const { preguntas, reglas } = leerSemillaAsistente();

// Tabla de verdad de contracts/asistente.md (SC-002): 3 × 2 × 5 = 30 combinaciones.
const esperado = (tipo: string, cesionario: string, riesgo: string): string => {
  if (tipo === 'BODEGA') return 'LIC-09';
  if (tipo === 'CORPORATIVO') return 'LIC-05';
  if (riesgo === 'NO_SE') return 'NO_DETERMINADA';
  if (cesionario === 'SI') {
    return { BAJO: 'LIC-01', MEDIO: 'LIC-06', ALTO: 'LIC-07', MUY_ALTO: 'LIC-08' }[riesgo] ?? '';
  }
  return { BAJO: 'LIC-01', MEDIO: 'LIC-02', ALTO: 'LIC-03', MUY_ALTO: 'LIC-04' }[riesgo] ?? '';
};

const combinaciones = ['BODEGA', 'CORPORATIVO', 'OTRO'].flatMap((tipo) =>
  ['SI', 'NO'].flatMap((cesionario) =>
    ['BAJO', 'MEDIO', 'ALTO', 'MUY_ALTO', 'NO_SE'].map(
      (riesgo) => [tipo, cesionario, riesgo, esperado(tipo, cesionario, riesgo)] as const,
    ),
  ),
);

const resultadoComoTexto = (resultado: ReturnType<typeof proponerLicencia>): string =>
  resultado.tipo === 'PROPUESTA' ? resultado.codigoReceta : resultado.tipo;

describe('proponerLicencia con las preguntas y reglas de la semilla', () => {
  it('la semilla tiene 3 preguntas con 3, 2 y 5 opciones (incluida "No lo sé")', () => {
    expect(preguntas.map((pregunta) => pregunta.opciones.length)).toEqual([3, 2, 5]);
    expect(combinaciones).toHaveLength(30);
  });

  it.each(combinaciones)('%s / %s / %s → %s', (tipo, cesionario, riesgo, licencia) => {
    const resultado = proponerLicencia(preguntas, reglas, {
      TIPO_ESTABLECIMIENTO: tipo,
      ES_CESIONARIO: cesionario,
      NIVEL_RIESGO: riesgo,
    });

    expect(resultadoComoTexto(resultado)).toBe(licencia);
    if (resultado.tipo === 'NO_DETERMINADA') {
      expect(resultado.motivo).toBe('SIN_REGLA');
    }
  });
});

describe('reglas del motor', () => {
  const respuestas = { TIPO_ESTABLECIMIENTO: 'OTRO', ES_CESIONARIO: 'NO', NIVEL_RIESGO: 'MEDIO' };

  it('la prioridad manda sobre el orden en que llegan las reglas', () => {
    const desordenadas: ReglaAsistente[] = [
      { prioridad: 50, condiciones: { NIVEL_RIESGO: 'MEDIO' }, codigoReceta: 'LIC-02' },
      { prioridad: 5, condiciones: { ES_CESIONARIO: 'NO' }, codigoReceta: 'LIC-01' },
    ];

    expect(proponerLicencia(preguntas, desordenadas, respuestas)).toEqual({
      tipo: 'PROPUESTA',
      codigoReceta: 'LIC-01',
    });
  });

  it('una regla coincide solo si todas sus condiciones coinciden', () => {
    const regla: ReglaAsistente = {
      prioridad: 1,
      condiciones: { ES_CESIONARIO: 'SI', NIVEL_RIESGO: 'MEDIO' },
      codigoReceta: 'LIC-06',
    };

    expect(proponerLicencia(preguntas, [regla], respuestas)).toEqual({
      tipo: 'NO_DETERMINADA',
      motivo: 'SIN_REGLA',
    });
  });

  it('una regla sin condiciones coincide con cualquier respuesta', () => {
    const comodin: ReglaAsistente = { prioridad: 99, condiciones: {}, codigoReceta: 'LIC-01' };

    expect(proponerLicencia(preguntas, [comodin], respuestas)).toEqual({
      tipo: 'PROPUESTA',
      codigoReceta: 'LIC-01',
    });
  });

  it('sin reglas no se puede determinar la licencia', () => {
    expect(proponerLicencia(preguntas, [], respuestas)).toEqual({
      tipo: 'NO_DETERMINADA',
      motivo: 'SIN_REGLA',
    });
  });

  it('no modifica la lista de reglas recibida', () => {
    const copia = [...reglas];
    proponerLicencia(preguntas, reglas, respuestas);
    expect(reglas).toEqual(copia);
  });
});

describe('validarRespuestas', () => {
  const completas = { TIPO_ESTABLECIMIENTO: 'OTRO', ES_CESIONARIO: 'NO', NIVEL_RIESGO: 'BAJO' };

  it('acepta una respuesta válida por pregunta', () => {
    expect(validarRespuestas(preguntas, completas)).toEqual([]);
  });

  it('detecta una pregunta sin responder', () => {
    const { NIVEL_RIESGO: _omitida, ...incompletas } = completas;

    expect(validarRespuestas(preguntas, incompletas)).toEqual([
      { pregunta: 'NIVEL_RIESGO', mensaje: 'Falta responder esta pregunta' },
    ]);
  });

  it('detecta un código de pregunta desconocido', () => {
    expect(validarRespuestas(preguntas, { ...completas, COLOR_FAVORITO: 'AZUL' })).toEqual([
      { pregunta: 'COLOR_FAVORITO', mensaje: 'No es una pregunta del asistente' },
    ]);
  });

  it('detecta un valor fuera de las opciones, sin repetir el valor recibido', () => {
    const errores = validarRespuestas(preguntas, { ...completas, NIVEL_RIESGO: 'ENORME' });

    expect(errores).toEqual([
      { pregunta: 'NIVEL_RIESGO', mensaje: 'El valor no está entre las opciones de la pregunta' },
    ]);
    expect(JSON.stringify(errores)).not.toContain('ENORME');
  });

  it('informa varios errores a la vez, en el orden de las preguntas', () => {
    const errores = validarRespuestas(preguntas, { ES_CESIONARIO: 'TAL_VEZ' });

    expect(errores.map((error) => error.pregunta)).toEqual([
      'TIPO_ESTABLECIMIENTO',
      'ES_CESIONARIO',
      'NIVEL_RIESGO',
    ]);
  });

  it('proponerLicencia rechaza respuestas inválidas con todos los errores', () => {
    let capturado: unknown;
    try {
      proponerLicencia(preguntas, reglas, { TIPO_ESTABLECIMIENTO: 'OTRO' });
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(ErrorRespuestasInvalidas);
    expect((capturado as ErrorRespuestasInvalidas).errores.map((error) => error.pregunta)).toEqual([
      'ES_CESIONARIO',
      'NIVEL_RIESGO',
    ]);
  });
});
