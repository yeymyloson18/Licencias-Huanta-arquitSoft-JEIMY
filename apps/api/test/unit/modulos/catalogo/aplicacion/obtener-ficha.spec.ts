import { ObtenerFicha } from '../../../../../src/modulos/catalogo/aplicacion/obtener-ficha';
import { RepositorioCatalogoFalso } from '../apoyo/repositorio-catalogo-falso';

describe('ObtenerFicha', () => {
  it('devuelve la receta completa si está activa', async () => {
    const repositorio = new RepositorioCatalogoFalso();

    const receta = await new ObtenerFicha(repositorio).ejecutar('LIC-03');

    expect(receta?.codigo.valor).toBe('LIC-03');
    expect(receta?.tasa.aTextoSoles()).toBe('305.90');
    expect(receta?.requisitos.length).toBeGreaterThan(0);
    expect(repositorio.recetasPedidas).toEqual(['LIC-03']);
  });

  it('devuelve null si la receta está desactivada (el público no la ve, FR-013)', async () => {
    const repositorio = new RepositorioCatalogoFalso();
    repositorio.desactivar('LIC-06');

    expect(await new ObtenerFicha(repositorio).ejecutar('LIC-06')).toBeNull();
  });

  it('devuelve null si la receta no existe', async () => {
    const repositorio = new RepositorioCatalogoFalso();
    repositorio.recetas = repositorio.recetas.filter((receta) => receta.codigo.valor !== 'LIC-09');

    expect(await new ObtenerFicha(repositorio).ejecutar('LIC-09')).toBeNull();
  });
});
