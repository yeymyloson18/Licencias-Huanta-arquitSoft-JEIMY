import { ActualizarReceta } from '../../../../../src/modulos/catalogo/aplicacion/actualizar-receta';
import { ErrorValidacionReceta } from '../../../../../src/modulos/catalogo/dominio/error-validacion-receta';
import type { InvalidadorCacheCatalogo } from '../../../../../src/modulos/catalogo/dominio/invalidador-cache-catalogo';
import type { RecetaCompleta } from '../../../../../src/modulos/catalogo/dominio/receta-completa';
import type {
  GuardadoReceta,
  ResultadoUnidadDeTrabajo,
  TrabajoReceta,
  UnidadDeTrabajoCatalogo,
} from '../../../../../src/modulos/catalogo/dominio/unidad-de-trabajo-catalogo';
import { RepositorioCatalogoFalso } from '../apoyo/repositorio-catalogo-falso';

const USUARIO = '00000000-0000-4000-8000-0000000000aa';
const AHORA = new Date('2026-11-18T15:00:00.000Z');

/** Doble de la unidad de trabajo: recetas en memoria y registro de lo que se guardaría. */
class UnidadDeTrabajoFalsa implements UnidadDeTrabajoCatalogo {
  readonly guardados: GuardadoReceta[] = [];
  readonly eventos: string[];

  constructor(
    private readonly recetas: RecetaCompleta[],
    eventos: string[],
  ) {
    this.eventos = eventos;
  }

  ejecutar<T>(
    codigo: string,
    trabajo: (receta: RecetaCompleta) => TrabajoReceta<T>,
  ): Promise<ResultadoUnidadDeTrabajo<T> | null> {
    const receta = this.recetas.find((candidata) => candidata.codigo.valor === codigo);
    if (!receta) {
      return Promise.resolve(null);
    }
    const { guardar, resultado } = trabajo(receta);
    if (guardar) {
      this.guardados.push(guardar);
      this.eventos.push('confirmar');
    }
    return Promise.resolve({ receta: guardar?.receta ?? receta, resultado });
  }
}

const preparar = (opciones: { invalidacionFalla?: boolean } = {}) => {
  const eventos: string[] = [];
  const unidad = new UnidadDeTrabajoFalsa(new RepositorioCatalogoFalso().recetas, eventos);
  const invalidados: string[] = [];
  const invalidador: InvalidadorCacheCatalogo = {
    invalidar: (codigo) => {
      eventos.push('invalidar');
      invalidados.push(codigo);
      return opciones.invalidacionFalla
        ? Promise.reject(new Error('Redis caído'))
        : Promise.resolve();
    },
  };
  const casoDeUso = new ActualizarReceta(unidad, invalidador, { ahora: () => AHORA });
  return { casoDeUso, unidad, invalidados, eventos };
};

describe('ActualizarReceta', () => {
  it('con cambios guarda la receta y el registro con usuarioId y fecha, y después invalida la caché', async () => {
    const { casoDeUso, unidad, invalidados, eventos } = preparar();

    const resultado = await casoDeUso.ejecutar('LIC-02', { tasa: '180.00' }, USUARIO);

    expect(resultado).toMatchObject({ tipo: 'ACTUALIZADA', campos: ['tasa'] });
    if (resultado.tipo === 'ACTUALIZADA') {
      expect(resultado.receta.tasa.aTextoSoles()).toBe('180.00');
    }
    expect(unidad.guardados).toHaveLength(1);
    expect(unidad.guardados[0]).toMatchObject({
      usuarioId: USUARIO,
      en: AHORA,
      diferencias: { tasa: { antes: '177.10', despues: '180.00' } },
    });
    expect(invalidados).toEqual(['LIC-02']);
    expect(eventos).toEqual(['confirmar', 'invalidar']);
  });

  it('sin cambios no guarda, no registra y no invalida (FR-022)', async () => {
    const { casoDeUso, unidad, invalidados } = preparar();

    const resultado = await casoDeUso.ejecutar('LIC-02', { tasa: '177.10' }, USUARIO);

    expect(resultado).toMatchObject({ tipo: 'ACTUALIZADA', campos: [] });
    expect(unidad.guardados).toEqual([]);
    expect(invalidados).toEqual([]);
  });

  it('con errores de dominio lanza ErrorValidacionReceta y no guarda', async () => {
    const { casoDeUso, unidad, invalidados } = preparar();

    await expect(
      casoDeUso.ejecutar('LIC-02', { tasa: '-1.00', requisitos: [] }, USUARIO),
    ).rejects.toBeInstanceOf(ErrorValidacionReceta);
    expect(unidad.guardados).toEqual([]);
    expect(invalidados).toEqual([]);
  });

  it('una receta inexistente da NO_ENCONTRADA', async () => {
    const { casoDeUso, invalidados } = preparar();

    expect(await casoDeUso.ejecutar('LIC-00', { tasa: '1.00' }, USUARIO)).toEqual({
      tipo: 'NO_ENCONTRADA',
    });
    expect(invalidados).toEqual([]);
  });

  it('si la invalidación de la caché falla, el caso de uso termina bien', async () => {
    const { casoDeUso, unidad } = preparar({ invalidacionFalla: true });

    const resultado = await casoDeUso.ejecutar('LIC-02', { tasa: '181.00' }, USUARIO);

    expect(resultado.tipo).toBe('ACTUALIZADA');
    expect(unidad.guardados).toHaveLength(1);
  });
});
