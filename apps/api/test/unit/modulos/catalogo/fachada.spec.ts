import { ListarRecetas } from '../../../../src/modulos/catalogo/aplicacion/listar-recetas';
import { ObtenerFicha } from '../../../../src/modulos/catalogo/aplicacion/obtener-ficha';
import { crearRecetaCompleta } from '../../../../src/modulos/catalogo/dominio/receta-completa';
import { FachadaCatalogo } from '../../../../src/modulos/catalogo/fachada';
import { RepositorioCatalogoFalso } from './apoyo/repositorio-catalogo-falso';
import { leerSemillaCatalogo } from './apoyo/semilla-catalogo';

/** Repositorio con las recetas de la semilla y `id` de requisito como los tendría la base. */
const repositorioConIds = (): RepositorioCatalogoFalso => {
  const repositorio = new RepositorioCatalogoFalso();
  let siguienteId = 1;
  repositorio.recetas = leerSemillaCatalogo().map((datos) =>
    crearRecetaCompleta({
      ...datos,
      requisitos: datos.requisitos.map((requisito) => ({ ...requisito, id: siguienteId++ })),
    }),
  );
  return repositorio;
};

const fachadaCon = (repositorio: RepositorioCatalogoFalso) =>
  new FachadaCatalogo(new ListarRecetas(repositorio), new ObtenerFicha(repositorio));

describe('FachadaCatalogo.obtenerRecetaVigente (004)', () => {
  it('devuelve una licencia activa con su ruta, tasa y requisitos en orden', async () => {
    const receta = await fachadaCon(repositorioConIds()).obtenerRecetaVigente('LIC-02');

    expect(receta).toMatchObject({
      codigo: 'LIC-02',
      ruta: 'A',
      tasa: '177.10',
      plazoDias: 2,
      tipoPlazo: 'HABILES',
      calificacion: 'APROBACION_AUTOMATICA',
      ordenItse: 'POSTERIOR',
      plazoItseDias: 9,
      vigenciaMeses: null,
    });
    const ordenes = receta?.requisitos.map((requisito) => requisito.orden) ?? [];
    expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b));
    expect(receta?.requisitos.every((requisito) => requisito.id > 0)).toBe(true);
    expect(receta?.requisitos.map((requisito) => requisito.condicion)).toContain(
      'CON_REPRESENTANTE',
    );
  });

  it('devuelve null para una licencia desactivada', async () => {
    const repositorio = repositorioConIds();
    repositorio.desactivar('LIC-06');

    expect(await fachadaCon(repositorio).obtenerRecetaVigente('LIC-06')).toBeNull();
  });

  it('devuelve null para un trámite conectado (fuera de la 004)', async () => {
    expect(await fachadaCon(repositorioConIds()).obtenerRecetaVigente('TRF-01')).toBeNull();
  });

  it('devuelve null para una receta que no existe', async () => {
    expect(await fachadaCon(repositorioConIds()).obtenerRecetaVigente('LIC-00')).toBeNull();
  });

  it('falla si una receta leída del catálogo tiene un requisito sin id', async () => {
    await expect(
      fachadaCon(new RepositorioCatalogoFalso()).obtenerRecetaVigente('LIC-02'),
    ).rejects.toThrow('Requisito sin id en la receta LIC-02');
  });

  it('listarRecetas sigue delegando en el caso de uso de la 001', async () => {
    const recetas = await fachadaCon(repositorioConIds()).listarRecetas({ tipo: 'LICENCIA' });
    expect(recetas).toHaveLength(9);
  });
});
