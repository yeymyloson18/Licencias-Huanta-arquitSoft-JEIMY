import {
  ErrorPreguntaInvalida,
  PreguntaOrientacion,
} from '../../../../../src/modulos/orientacion/dominio/pregunta-orientacion';

// FR-013 y FR-024 de la 012 (data-model.md): pregunta de 1 a 500 caracteres, historial de hasta 6
// turnos de 1 a 1,200 caracteres.

const turno = (texto = 'Hola', rol: string = 'PERSONA') => ({ rol, texto });

const errorDe = (accion: () => unknown): ErrorPreguntaInvalida => {
  try {
    accion();
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorPreguntaInvalida);
    return error as ErrorPreguntaInvalida;
  }
  throw new Error('Se esperaba ErrorPreguntaInvalida');
};

describe('PreguntaOrientacion', () => {
  it('recorta los espacios de la pregunta y de cada turno', () => {
    const pregunta = PreguntaOrientacion.crear('  ¿Cuánto cuesta?  ', [turno('  Hola  ')]);

    expect(pregunta.texto).toBe('¿Cuánto cuesta?');
    expect(pregunta.historial).toEqual([{ rol: 'PERSONA', texto: 'Hola' }]);
  });

  it('sin historial usa una lista vacía', () => {
    expect(PreguntaOrientacion.crear('¿Cómo pago?').historial).toEqual([]);
  });

  it.each(['', '   ', '\n\t '])('rechaza una pregunta vacía o solo con espacios (%j)', (texto) => {
    expect(errorDe(() => PreguntaOrientacion.crear(texto)).campo).toBe('pregunta');
  });

  it('acepta 500 caracteres y rechaza 501', () => {
    expect(PreguntaOrientacion.crear('a'.repeat(500)).texto).toHaveLength(500);
    expect(errorDe(() => PreguntaOrientacion.crear('a'.repeat(501))).campo).toBe('pregunta');
  });

  it('acepta 6 turnos y rechaza 7', () => {
    const seis = Array.from({ length: 6 }, (_, indice) =>
      turno(`turno ${String(indice)}`, indice % 2 === 0 ? 'PERSONA' : 'ORIENTADOR'),
    );

    expect(PreguntaOrientacion.crear('¿Y?', seis).historial).toHaveLength(6);
    expect(errorDe(() => PreguntaOrientacion.crear('¿Y?', [...seis, turno()])).campo).toBe(
      'historial',
    );
  });

  it.each([
    ['vacío', turno('  ')],
    ['de más de 1,200 caracteres', turno('a'.repeat(1201))],
    ['con un rol desconocido', turno('Hola', 'SISTEMA')],
  ])('rechaza un turno %s', (_caso, malo) => {
    expect(errorDe(() => PreguntaOrientacion.crear('¿Y?', [malo])).campo).toBe('historial');
  });

  it('acepta un turno de 1,200 caracteres', () => {
    expect(PreguntaOrientacion.crear('¿Y?', [turno('a'.repeat(1200))]).historial).toHaveLength(1);
  });

  it('el mensaje del error no repite el texto de la pregunta (FR-015)', () => {
    const error = errorDe(() => PreguntaOrientacion.crear(`mi DNI 40000001 ${'a'.repeat(500)}`));

    expect(error.message).not.toContain('40000001');
  });
});
