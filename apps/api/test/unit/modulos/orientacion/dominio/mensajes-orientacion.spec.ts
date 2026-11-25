import {
  ACLARACION_ORIENTACION,
  LARGO_MAXIMO_RESPUESTA,
  TEXTO_CONSULTA_TRAMITE,
  TEXTO_FUERA_DE_TEMA,
  TEXTO_NO_DISPONIBLE,
  TEXTO_SIN_INFORMACION,
} from '../../../../../src/modulos/orientacion/dominio/mensajes-orientacion';

// Textos fijos de contracts/api-orientacion.md (012). Cuando el resultado no es RESPONDIDA, el
// administrado ve estos textos, nunca el del modelo.

describe('mensajes de orientación', () => {
  it('cada texto fijo dice lo que pide el contrato', () => {
    expect(TEXTO_SIN_INFORMACION).toContain('No tengo esa información');
    expect(TEXTO_SIN_INFORMACION).toContain('Mesa de partes');
    expect(TEXTO_FUERA_DE_TEMA).toContain('Solo puedo ayudarle con licencias de funcionamiento');
    expect(TEXTO_CONSULTA_TRAMITE).toContain("'Consultar mi trámite'");
    expect(TEXTO_NO_DISPONIBLE).toContain("'¿Qué licencia necesito?'");
    expect(ACLARACION_ORIENTACION).toBe(
      'Esta es una orientación. Lo oficial es la ficha de cada licencia y la Municipalidad.',
    );
  });

  it('ningún texto fijo tiene montos ni plazos y todos caben en el largo máximo', () => {
    for (const texto of [
      TEXTO_SIN_INFORMACION,
      TEXTO_FUERA_DE_TEMA,
      TEXTO_CONSULTA_TRAMITE,
      TEXTO_NO_DISPONIBLE,
      ACLARACION_ORIENTACION,
    ]) {
      expect(texto).not.toMatch(/\d/);
      expect(texto.length).toBeLessThanOrEqual(LARGO_MAXIMO_RESPUESTA);
    }
  });
});
