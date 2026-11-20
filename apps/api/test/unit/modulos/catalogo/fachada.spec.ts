import { ListarRecetas } from '../../../../src/modulos/catalogo/aplicacion/listar-recetas';
import { ObtenerFicha } from '../../../../src/modulos/catalogo/aplicacion/obtener-ficha';
import type { LectorClasificacionRecetas } from '../../../../src/modulos/catalogo/dominio/lector-clasificacion-recetas';
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

describe('FachadaCatalogo para la evaluación (005)', () => {
  // Clasificación de la semilla: LIC-05 corporativa; LIC-06 a LIC-08 cesionarios.
  const clasificacion: LectorClasificacionRecetas = {
    obtener: (codigo) =>
      Promise.resolve(
        codigo === 'LIC-00'
          ? null
          : {
              esCesionario: ['LIC-06', 'LIC-07', 'LIC-08'].includes(codigo),
              esCorporativa: codigo === 'LIC-05',
            },
      ),
  };
  const fachada = (repositorio = repositorioConIds()) =>
    new FachadaCatalogo(
      new ListarRecetas(repositorio),
      new ObtenerFicha(repositorio),
      clasificacion,
    );

  it('devuelve la licencia con su nivel, tasa y clasificación', async () => {
    expect(await fachada().obtenerRecetaParaEvaluacion('LIC-07')).toEqual({
      codigo: 'LIC-07',
      nombre: 'Licencia para cesionarios – riesgo alto',
      ruta: 'B',
      tasa: '309.20',
      nivelRiesgo: 'ALTO',
      esCesionario: true,
      esCorporativa: false,
    });
  });

  it.each(['TRF-01', 'LIC-00'])('devuelve null para %s', async (codigo) => {
    expect(await fachada().obtenerRecetaParaEvaluacion(codigo)).toBeNull();
  });

  it('sin lector de clasificación no puede evaluar', async () => {
    expect(await fachadaCon(repositorioConIds()).obtenerRecetaParaEvaluacion('LIC-02')).toBeNull();
  });

  it('lista las 9 licencias activas con su clasificación', async () => {
    const licencias = await fachada().listarLicenciasParaEvaluacion();

    expect(licencias).toHaveLength(9);
    expect(licencias.filter((l) => l.esCesionario).map((l) => l.codigo)).toEqual([
      'LIC-06',
      'LIC-07',
      'LIC-08',
    ]);
  });
});
