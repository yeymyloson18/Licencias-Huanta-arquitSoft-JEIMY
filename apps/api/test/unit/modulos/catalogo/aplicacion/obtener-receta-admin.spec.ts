import { ObtenerRecetaAdmin } from '../../../../../src/modulos/catalogo/aplicacion/obtener-receta-admin';
import { RepositorioCatalogoFalso } from '../apoyo/repositorio-catalogo-falso';

describe('ObtenerRecetaAdmin', () => {
  it('devuelve una receta desactivada para poder editarla', async () => {
    const repositorio = new RepositorioCatalogoFalso();
    repositorio.desactivar('LIC-06');

    const receta = await new ObtenerRecetaAdmin(repositorio).ejecutar('LIC-06');

    expect(receta?.activa).toBe(false);
  });

  it('devuelve null si la receta no existe', async () => {
    expect(
      await new ObtenerRecetaAdmin(new RepositorioCatalogoFalso()).ejecutar('LIC-00'),
    ).toBeNull();
  });
});
