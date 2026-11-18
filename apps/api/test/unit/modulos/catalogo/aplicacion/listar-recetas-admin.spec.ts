import { ListarRecetasAdmin } from '../../../../../src/modulos/catalogo/aplicacion/listar-recetas-admin';
import { RepositorioCatalogoFalso } from '../apoyo/repositorio-catalogo-falso';

describe('ListarRecetasAdmin', () => {
  it('devuelve las 12 recetas, incluidas las desactivadas (FR-016)', async () => {
    const repositorio = new RepositorioCatalogoFalso();
    repositorio.desactivar('LIC-06');

    const recetas = await new ListarRecetasAdmin(repositorio).ejecutar();

    expect(recetas).toHaveLength(12);
    expect(recetas.find((receta) => receta.codigo.valor === 'LIC-06')?.activa).toBe(false);
  });
});
