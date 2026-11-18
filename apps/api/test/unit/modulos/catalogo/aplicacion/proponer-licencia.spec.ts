import { ProponerLicencia } from '../../../../../src/modulos/catalogo/aplicacion/proponer-licencia';
import { ErrorRespuestasInvalidas } from '../../../../../src/modulos/catalogo/dominio/motor-reglas-asistente';
import { RepositorioCatalogoFalso } from '../apoyo/repositorio-catalogo-falso';

const respuestas = (tipo: string, cesionario: string, riesgo: string) => ({
  TIPO_ESTABLECIMIENTO: tipo,
  ES_CESIONARIO: cesionario,
  NIVEL_RIESGO: riesgo,
});

describe('ProponerLicencia', () => {
  it('con respuestas válidas y la receta activa propone la receta completa', async () => {
    const repositorio = new RepositorioCatalogoFalso();

    const resultado = await new ProponerLicencia(repositorio).ejecutar(
      respuestas('OTRO', 'NO', 'MEDIO'),
    );

    expect(resultado.tipo).toBe('PROPUESTA');
    if (resultado.tipo === 'PROPUESTA') {
      expect(resultado.receta.codigo.valor).toBe('LIC-02');
      expect(resultado.receta.tasa.aTextoSoles()).toBe('177.10');
      expect(resultado.receta.requisitos.length).toBeGreaterThan(0);
    }
  });

  it('si ninguna regla coincide responde NO_DETERMINADA / SIN_REGLA sin pedir recetas', async () => {
    const repositorio = new RepositorioCatalogoFalso();

    const resultado = await new ProponerLicencia(repositorio).ejecutar(
      respuestas('OTRO', 'NO', 'NO_SE'),
    );

    expect(resultado).toEqual({ tipo: 'NO_DETERMINADA', motivo: 'SIN_REGLA' });
    expect(repositorio.recetasPedidas).toEqual([]);
  });

  it('si la primera regla apunta a una receta desactivada no prueba la siguiente (FR-006)', async () => {
    const repositorio = new RepositorioCatalogoFalso();
    repositorio.desactivar('LIC-06');

    const resultado = await new ProponerLicencia(repositorio).ejecutar(
      respuestas('OTRO', 'SI', 'MEDIO'),
    );

    expect(resultado).toEqual({ tipo: 'NO_DETERMINADA', motivo: 'RECETA_NO_DISPONIBLE' });
    expect(repositorio.recetasPedidas).toEqual(['LIC-06']);
  });

  it('si la receta de la regla no existe en el catálogo también es RECETA_NO_DISPONIBLE', async () => {
    const repositorio = new RepositorioCatalogoFalso();
    repositorio.recetas = repositorio.recetas.filter((receta) => receta.codigo.valor !== 'LIC-09');

    const resultado = await new ProponerLicencia(repositorio).ejecutar(
      respuestas('BODEGA', 'NO', 'BAJO'),
    );

    expect(resultado).toEqual({ tipo: 'NO_DETERMINADA', motivo: 'RECETA_NO_DISPONIBLE' });
  });

  it('con respuestas inválidas lanza ErrorRespuestasInvalidas con cada pregunta mal respondida', async () => {
    const repositorio = new RepositorioCatalogoFalso();

    const promesa = new ProponerLicencia(repositorio).ejecutar({
      TIPO_ESTABLECIMIENTO: 'OTRO',
      NIVEL_RIESGO: 'ENORME',
    });

    await expect(promesa).rejects.toBeInstanceOf(ErrorRespuestasInvalidas);
    await expect(promesa).rejects.toMatchObject({
      errores: [{ pregunta: 'ES_CESIONARIO' }, { pregunta: 'NIVEL_RIESGO' }],
    });
    expect(repositorio.recetasPedidas).toEqual([]);
  });
});
