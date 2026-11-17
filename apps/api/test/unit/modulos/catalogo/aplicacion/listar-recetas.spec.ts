import { ListarRecetas } from '../../../../../src/modulos/catalogo/aplicacion/listar-recetas';
import {
  crearReceta,
  type Receta,
  type TipoReceta,
} from '../../../../../src/modulos/catalogo/dominio/receta';
import type { RepositorioCatalogo } from '../../../../../src/modulos/catalogo/dominio/repositorio-catalogo';

class RepositorioEnMemoria implements RepositorioCatalogo {
  filtrosRecibidos: { tipo?: TipoReceta }[] = [];

  constructor(private readonly recetas: Receta[]) {}

  listarActivas(filtro: { tipo?: TipoReceta }): Promise<Receta[]> {
    this.filtrosRecibidos.push(filtro);
    return Promise.resolve(
      this.recetas.filter((receta) => filtro.tipo === undefined || receta.tipo === filtro.tipo),
    );
  }
}

const lic01 = crearReceta({
  codigo: 'LIC-01',
  nombre: 'Licencia de funcionamiento – riesgo bajo',
  tipo: 'LICENCIA',
  ruta: 'A',
  tasa: '159.50',
  plazoDias: 2,
});
const lic09 = crearReceta({
  codigo: 'LIC-09',
  nombre: 'Licencia provisional para bodegas',
  tipo: 'LICENCIA',
  ruta: 'C',
  tasa: '0.00',
  plazoDias: 5,
});
const trf01 = crearReceta({
  codigo: 'TRF-01',
  nombre: 'Transferencia de licencia o cambio de denominación',
  tipo: 'TRAMITE_CONECTADO',
  ruta: null,
  tasa: '45.10',
  plazoDias: null,
});

describe('ListarRecetas', () => {
  it('pasa el filtro de tipo al repositorio', async () => {
    const repositorio = new RepositorioEnMemoria([lic01, trf01]);

    const resultado = await new ListarRecetas(repositorio).ejecutar({ tipo: 'LICENCIA' });

    expect(repositorio.filtrosRecibidos).toEqual([{ tipo: 'LICENCIA' }]);
    expect(resultado.map((receta) => receta.codigo)).toEqual(['LIC-01']);
  });

  it('sin filtro, pide todas las recetas activas', async () => {
    const repositorio = new RepositorioEnMemoria([lic01, trf01]);

    const resultado = await new ListarRecetas(repositorio).ejecutar({});

    expect(repositorio.filtrosRecibidos).toEqual([{}]);
    expect(resultado).toHaveLength(2);
  });

  it('devuelve DTO planos con la tasa como texto', async () => {
    const resultado = await new ListarRecetas(new RepositorioEnMemoria([lic01, lic09])).ejecutar(
      {},
    );

    expect(resultado).toEqual([
      {
        codigo: 'LIC-01',
        nombre: 'Licencia de funcionamiento – riesgo bajo',
        tipo: 'LICENCIA',
        ruta: 'A',
        tasa: '159.50',
        plazoDias: 2,
      },
      {
        codigo: 'LIC-09',
        nombre: 'Licencia provisional para bodegas',
        tipo: 'LICENCIA',
        ruta: 'C',
        tasa: '0.00',
        plazoDias: 5,
      },
    ]);
  });

  it('usa null para la ruta y el plazo de los trámites conectados', async () => {
    const [dto] = await new ListarRecetas(new RepositorioEnMemoria([trf01])).ejecutar({});

    expect(dto).toMatchObject({ codigo: 'TRF-01', ruta: null, plazoDias: null, tasa: '45.10' });
  });

  it('respeta el orden que entrega el repositorio', async () => {
    const resultado = await new ListarRecetas(
      new RepositorioEnMemoria([lic09, trf01, lic01]),
    ).ejecutar({});

    expect(resultado.map((receta) => receta.codigo)).toEqual(['LIC-09', 'TRF-01', 'LIC-01']);
  });
});
