import { interpretarRespuesta } from '../../../../../src/modulos/orientacion/dominio/interpretar-respuesta';

// research R-06 de la 012: el sistema no confía en el modelo. Valida su JSON sin dependencias externas
// (el dominio no importa zod) y recorta el texto a 1,200 caracteres.

const json = (objeto: unknown) => JSON.stringify(objeto);

describe('interpretarRespuesta', () => {
  it('un JSON válido es una RespuestaModelo', () => {
    expect(
      interpretarRespuesta(
        json({ tipo: 'RESPONDIDA', texto: 'La tasa es S/ 177.10.', codigosReceta: ['LIC-02'] }),
      ),
    ).toEqual({ tipo: 'RESPONDIDA', texto: 'La tasa es S/ 177.10.', codigosReceta: ['LIC-02'] });
  });

  it.each(['SIN_INFORMACION', 'FUERA_DE_TEMA', 'CONSULTA_TRAMITE'])('acepta el tipo %s', (tipo) => {
    expect(interpretarRespuesta(json({ tipo, texto: 'x' }))?.tipo).toBe(tipo);
  });

  it('sin codigosReceta usa una lista vacía y descarta los que no son texto', () => {
    expect(
      interpretarRespuesta(json({ tipo: 'RESPONDIDA', texto: 'Hola' }))?.codigosReceta,
    ).toEqual([]);
    expect(
      interpretarRespuesta(
        json({ tipo: 'RESPONDIDA', texto: 'Hola', codigosReceta: ['LIC-01', 3] }),
      )?.codigosReceta,
    ).toEqual(['LIC-01']);
  });

  it('toma el primer objeto JSON aunque haya palabras antes y después', () => {
    const contenido = `Aquí va:\n${json({ tipo: 'RESPONDIDA', texto: 'Hola {con llaves}' })}\nFin. {}`;

    expect(interpretarRespuesta(contenido)).toEqual({
      tipo: 'RESPONDIDA',
      texto: 'Hola {con llaves}',
      codigosReceta: [],
    });
  });

  it('recorta el texto a 1,200 caracteres', () => {
    expect(
      interpretarRespuesta(json({ tipo: 'RESPONDIDA', texto: 'a'.repeat(3000) }))?.texto,
    ).toHaveLength(1200);
  });

  it.each([
    ['un tipo desconocido', json({ tipo: 'OTRO', texto: 'x' })],
    ['un texto vacío', json({ tipo: 'RESPONDIDA', texto: '   ' })],
    ['un texto de más de 4,000 caracteres', json({ tipo: 'RESPONDIDA', texto: 'a'.repeat(4001) })],
    ['un texto que no es texto', json({ tipo: 'RESPONDIDA', texto: 5 })],
    [
      'codigosReceta que no es lista',
      json({ tipo: 'RESPONDIDA', texto: 'x', codigosReceta: 'LIC-01' }),
    ],
    ['algo que no es JSON', 'La tasa es S/ 177.10'],
    ['un JSON cortado', '{"tipo":"RESPONDIDA","texto":"x"'],
    ['un JSON que no es objeto', '["RESPONDIDA"]'],
    ['un objeto con llaves pero JSON inválido', '{tipo: RESPONDIDA}'],
  ])('con %s es inválida (null)', (_caso, contenido) => {
    expect(interpretarRespuesta(contenido)).toBeNull();
  });
});
