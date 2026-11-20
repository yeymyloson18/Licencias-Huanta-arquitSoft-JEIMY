import { LicenciasDelGrupo } from '../../../../../src/modulos/tramites/aplicacion/licencias-del-grupo';
import type {
  CatalogoEvaluacion,
  LicenciaParaEvaluacion,
} from '../../../../../src/modulos/tramites/dominio/puertos/catalogo-evaluacion';

// Catálogo FICTICIO con la forma de las recetas sembradas (LIC-01..09).
const licencia = (
  codigo: string,
  grupo: LicenciaParaEvaluacion['grupo'],
  ruta: LicenciaParaEvaluacion['ruta'] = 'A',
): LicenciaParaEvaluacion => ({
  codigo,
  nombre: `Licencia ${codigo}`,
  ruta,
  tasa: '177.10',
  nivelRiesgo: 'MEDIO',
  grupo,
});

const CATALOGO: LicenciaParaEvaluacion[] = [
  licencia('LIC-01', 'ESTABLECIMIENTO'),
  licencia('LIC-02', 'ESTABLECIMIENTO'),
  licencia('LIC-05', 'CORPORATIVA'),
  licencia('LIC-06', 'CESIONARIO'),
  licencia('LIC-07', 'CESIONARIO'),
  licencia('LIC-09', 'BODEGA', 'C'),
];

const catalogo: CatalogoEvaluacion = {
  obtener: (codigo) => Promise.resolve(CATALOGO.find((l) => l.codigo === codigo) ?? null),
  listar: () => Promise.resolve(CATALOGO),
};

describe('LicenciasDelGrupo (FR-003 de la 005)', () => {
  const casoDeUso = new LicenciasDelGrupo(catalogo);
  const codigos = async (codigoReceta: string, estado = 'EN_EVALUACION' as const) =>
    (await casoDeUso.ejecutar({ estado, codigoReceta })).map((l) => l.codigo);

  it('EN_EVALUACION devuelve las licencias del mismo grupo, incluida la actual', async () => {
    expect(await codigos('LIC-02')).toEqual(['LIC-01', 'LIC-02']);
    expect(await codigos('LIC-06')).toEqual(['LIC-06', 'LIC-07']);
    expect(await codigos('LIC-09')).toEqual(['LIC-09']);
  });

  it('en otro estado no devuelve ninguna', async () => {
    const resultado = await casoDeUso.ejecutar({ estado: 'REGISTRADO', codigoReceta: 'LIC-02' });

    expect(resultado).toEqual([]);
  });

  it('si la receta actual ya no está vigente no devuelve ninguna', async () => {
    expect(await codigos('LIC-99')).toEqual([]);
  });
});
