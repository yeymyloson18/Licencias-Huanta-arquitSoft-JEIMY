import { ObtenerPreguntas } from '../../../../../src/modulos/catalogo/aplicacion/obtener-preguntas';
import { RepositorioCatalogoFalso } from '../apoyo/repositorio-catalogo-falso';

describe('ObtenerPreguntas', () => {
  it('devuelve las preguntas ordenadas por orden, con sus opciones del catálogo', async () => {
    const repositorio = new RepositorioCatalogoFalso();
    // Se invierten para comprobar que el caso de uso ordena.
    repositorio.asistente = {
      ...repositorio.asistente,
      preguntas: [...repositorio.asistente.preguntas].reverse(),
    };

    const preguntas = await new ObtenerPreguntas(repositorio).ejecutar();

    expect(preguntas.map((pregunta) => pregunta.codigo)).toEqual([
      'TIPO_ESTABLECIMIENTO',
      'ES_CESIONARIO',
      'NIVEL_RIESGO',
    ]);
    expect(preguntas[2]?.opciones.at(-1)).toEqual({ valor: 'NO_SE', texto: 'No lo sé' });
  });

  it('no expone las reglas del asistente', async () => {
    const preguntas = await new ObtenerPreguntas(new RepositorioCatalogoFalso()).ejecutar();

    expect(JSON.stringify(preguntas)).not.toContain('prioridad');
  });
});
