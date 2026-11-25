import type {
  RecetaResumenDto,
  RecetaVigenteDto,
} from '../../../../../src/modulos/catalogo/fachada';
import {
  FuenteCatalogoFachada,
  type LecturaCatalogo,
} from '../../../../../src/modulos/orientacion/infraestructura/fuente-catalogo-fachada';

// research R-02 de la 012: el chat lee el catálogo SOLO por la fachada del módulo Catálogo (con su
// caché de Redis), nunca sus tablas.

const resumen = (codigo: string): RecetaResumenDto => ({
  codigo,
  nombre: `Licencia ${codigo}`,
  tipo: 'LICENCIA',
  ruta: 'A',
  tasa: '177.10',
  plazoDias: 15,
});

const vigente = (codigo: string): RecetaVigenteDto => ({
  codigo,
  nombre: `Licencia ${codigo}`,
  ruta: 'B',
  tasa: '177.10',
  plazoDias: 15,
  tipoPlazo: 'HABILES',
  calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO',
  ordenItse: 'PREVIA',
  plazoItseDias: 7,
  vigenciaMeses: null,
  requisitos: [
    { id: 2, orden: 2, descripcion: 'Segundo', obligatorio: true, condicion: 'SIEMPRE' },
    { id: 1, orden: 1, descripcion: 'Primero', obligatorio: true, condicion: 'SIEMPRE' },
  ],
});

const fachadaDoble = (recetas: Record<string, RecetaVigenteDto | null>) => {
  const fachada = {
    listarRecetas: jest.fn((_filtro: unknown) =>
      Promise.resolve(Object.keys(recetas).map(resumen)),
    ),
    obtenerRecetaVigente: jest.fn((codigo: string) => Promise.resolve(recetas[codigo] ?? null)),
  };
  return fachada satisfies LecturaCatalogo;
};

describe('FuenteCatalogoFachada', () => {
  it('lista las licencias activas y lee cada receta vigente por la fachada', async () => {
    const fachada = fachadaDoble({ 'LIC-01': vigente('LIC-01'), 'LIC-02': vigente('LIC-02') });

    const licencias = await new FuenteCatalogoFachada(fachada).licenciasVigentes();

    expect(fachada.listarRecetas).toHaveBeenCalledWith({ tipo: 'LICENCIA' });
    expect(fachada.obtenerRecetaVigente.mock.calls.map(([codigo]) => codigo)).toEqual([
      'LIC-01',
      'LIC-02',
    ]);
    expect(licencias).toEqual([
      {
        codigo: 'LIC-01',
        nombre: 'Licencia LIC-01',
        ruta: 'B',
        tasa: '177.10',
        plazoDias: 15,
        tipoPlazo: 'HABILES',
        calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO',
        ordenItse: 'PREVIA',
        plazoItseDias: 7,
        vigenciaMeses: null,
        requisitos: ['Primero', 'Segundo'],
      },
      expect.objectContaining({ codigo: 'LIC-02' }),
    ]);
  });

  it('descarta las recetas que la fachada ya no da como vigentes', async () => {
    const fachada = fachadaDoble({ 'LIC-01': vigente('LIC-01'), 'LIC-09': null });

    const licencias = await new FuenteCatalogoFachada(fachada).licenciasVigentes();

    expect(licencias.map((licencia) => licencia.codigo)).toEqual(['LIC-01']);
  });

  it('propaga el error de la fachada (el caso de uso decide qué responder)', async () => {
    const fachada = fachadaDoble({});
    fachada.listarRecetas.mockRejectedValueOnce(new Error('Redis y PostgreSQL caídos'));

    await expect(new FuenteCatalogoFachada(fachada).licenciasVigentes()).rejects.toThrow();
  });
});
