import { Logger } from '@nestjs/common';
import {
  crearReceta,
  type Receta,
  type TipoReceta,
} from '../../../../../src/modulos/catalogo/dominio/receta';
import {
  aDatosRecetaCompleta,
  crearRecetaCompleta,
  type RecetaCompleta,
} from '../../../../../src/modulos/catalogo/dominio/receta-completa';
import type { RepositorioCatalogo } from '../../../../../src/modulos/catalogo/dominio/repositorio-catalogo';
import {
  RepositorioCatalogoConCache,
  type ClienteCache,
} from '../../../../../src/modulos/catalogo/infraestructura/repositorio-catalogo-con-cache';
import { leerSemillaCatalogo } from '../apoyo/semilla-catalogo';

const lic01 = crearReceta({
  codigo: 'LIC-01',
  nombre: 'Licencia de funcionamiento – riesgo bajo',
  tipo: 'LICENCIA',
  ruta: 'A',
  tasa: '159.50',
  plazoDias: 2,
});
const trf01 = crearReceta({
  codigo: 'TRF-01',
  nombre: 'Transferencia de licencia o cambio de denominación',
  tipo: 'TRAMITE_CONECTADO',
  ruta: null,
  tasa: '45.10',
  plazoDias: null,
});

const aPlano = (receta: Receta) => ({
  codigo: receta.codigo.valor,
  nombre: receta.nombre,
  tipo: receta.tipo,
  ruta: receta.ruta,
  tasa: receta.tasa.aTextoSoles(),
  plazoDias: receta.plazoDias?.dias ?? null,
});

class RedisFalso implements ClienteCache {
  datos = new Map<string, string>();
  llamadasSet: unknown[][] = [];
  fallarGet = false;
  fallarSet = false;

  get(clave: string): Promise<string | null> {
    return this.fallarGet
      ? Promise.reject(new Error('Stream isn’t writeable'))
      : Promise.resolve(this.datos.get(clave) ?? null);
  }

  set(clave: string, valor: string, modo: 'EX', segundos: number): Promise<unknown> {
    this.llamadasSet.push([clave, valor, modo, segundos]);
    if (this.fallarSet) {
      return Promise.reject(new Error('Stream isn’t writeable'));
    }
    this.datos.set(clave, valor);
    return Promise.resolve('OK');
  }
}

const completas = leerSemillaCatalogo().map(crearRecetaCompleta);
const lic03 = completas.find((receta) => receta.codigo.valor === 'LIC-03') as RecetaCompleta;

const crearInterno = (recetas: Receta[], completasInternas: RecetaCompleta[] = completas) => {
  const interno = {
    listarActivas: jest.fn((filtro: { tipo?: TipoReceta }) =>
      Promise.resolve(recetas.filter((r) => filtro.tipo === undefined || r.tipo === filtro.tipo)),
    ),
    obtener: jest.fn((codigo: string) =>
      Promise.resolve(completasInternas.find((r) => r.codigo.valor === codigo) ?? null),
    ),
    listarTodas: jest.fn(() => Promise.resolve(completasInternas)),
  };
  return interno satisfies RepositorioCatalogo;
};

describe('RepositorioCatalogoConCache', () => {
  let advertencia: jest.SpyInstance;

  beforeEach(() => {
    advertencia = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('si la clave está en caché, la devuelve sin consultar la base', async () => {
    const redis = new RedisFalso();
    redis.datos.set('catalogo:recetas:LICENCIA', JSON.stringify([aPlano(lic01)]));
    const interno = crearInterno([]);

    const resultado = await new RepositorioCatalogoConCache(interno, redis, 240).listarActivas({
      tipo: 'LICENCIA',
    });

    expect(interno.listarActivas).not.toHaveBeenCalled();
    expect(resultado.map(aPlano)).toEqual([aPlano(lic01)]);
  });

  it('si la clave no está, consulta la base y guarda el resultado con TTL de 240 s', async () => {
    const redis = new RedisFalso();
    const interno = crearInterno([lic01, trf01]);

    const resultado = await new RepositorioCatalogoConCache(interno, redis, 240).listarActivas({
      tipo: 'LICENCIA',
    });

    expect(interno.listarActivas).toHaveBeenCalledWith({ tipo: 'LICENCIA' });
    expect(resultado.map(aPlano)).toEqual([aPlano(lic01)]);
    expect(redis.llamadasSet).toEqual([
      ['catalogo:recetas:LICENCIA', JSON.stringify([aPlano(lic01)]), 'EX', 240],
    ]);
  });

  it('usa la clave TODOS sin filtro y conserva los null', async () => {
    const redis = new RedisFalso();

    await new RepositorioCatalogoConCache(crearInterno([lic01, trf01]), redis, 240).listarActivas(
      {},
    );

    expect(redis.llamadasSet[0]?.[0]).toBe('catalogo:recetas:TODOS');
    const guardado = JSON.parse(String(redis.llamadasSet[0]?.[1])) as unknown[];
    expect(guardado).toEqual([aPlano(lic01), aPlano(trf01)]);
  });

  it('una segunda consulta sale de la caché', async () => {
    const redis = new RedisFalso();
    const interno = crearInterno([lic01]);
    const repositorio = new RepositorioCatalogoConCache(interno, redis, 240);

    await repositorio.listarActivas({});
    const segunda = await repositorio.listarActivas({});

    expect(interno.listarActivas).toHaveBeenCalledTimes(1);
    expect(segunda.map(aPlano)).toEqual([aPlano(lic01)]);
  });

  it('si leer de Redis falla, consulta la base sin propagar el error', async () => {
    const redis = new RedisFalso();
    redis.fallarGet = true;
    const interno = crearInterno([lic01]);

    const resultado = await new RepositorioCatalogoConCache(interno, redis, 240).listarActivas({});

    expect(interno.listarActivas).toHaveBeenCalledTimes(1);
    expect(resultado.map(aPlano)).toEqual([aPlano(lic01)]);
    expect(advertencia).toHaveBeenCalledWith('Caché del catálogo no disponible');
  });

  it('si guardar en Redis falla, igual devuelve el resultado', async () => {
    const redis = new RedisFalso();
    redis.fallarSet = true;

    const resultado = await new RepositorioCatalogoConCache(
      crearInterno([lic01]),
      redis,
      240,
    ).listarActivas({});

    expect(resultado.map(aPlano)).toEqual([aPlano(lic01)]);
    expect(advertencia).toHaveBeenCalledWith('Caché del catálogo no disponible');
  });

  it('ignora un valor de caché corrupto y consulta la base', async () => {
    const redis = new RedisFalso();
    redis.datos.set('catalogo:recetas:TODOS', '{no es json');
    const interno = crearInterno([lic01]);

    const resultado = await new RepositorioCatalogoConCache(interno, redis, 240).listarActivas({});

    expect(interno.listarActivas).toHaveBeenCalledTimes(1);
    expect(resultado.map(aPlano)).toEqual([aPlano(lic01)]);
  });

  it('respeta el TTL configurado', async () => {
    const redis = new RedisFalso();

    await new RepositorioCatalogoConCache(crearInterno([lic01]), redis, 60).listarActivas({});

    expect(redis.llamadasSet[0]?.[3]).toBe(60);
  });

  describe('obtener (ficha completa, clave catalogo:receta:<CODIGO>)', () => {
    it('si no está en caché, la lee de la base y la guarda con el TTL configurado', async () => {
      const redis = new RedisFalso();
      const interno = crearInterno([]);

      const receta = await new RepositorioCatalogoConCache(interno, redis, 240).obtener('LIC-03');

      expect(interno.obtener).toHaveBeenCalledWith('LIC-03');
      expect(receta && aDatosRecetaCompleta(receta)).toEqual(aDatosRecetaCompleta(lic03));
      expect(redis.llamadasSet).toEqual([
        ['catalogo:receta:LIC-03', JSON.stringify(aDatosRecetaCompleta(lic03)), 'EX', 240],
      ]);
    });

    it('si está en caché, la devuelve sin consultar la base y con los requisitos en orden', async () => {
      const redis = new RedisFalso();
      redis.datos.set('catalogo:receta:LIC-03', JSON.stringify(aDatosRecetaCompleta(lic03)));
      const interno = crearInterno([]);

      const receta = await new RepositorioCatalogoConCache(interno, redis, 240).obtener('LIC-03');

      expect(interno.obtener).not.toHaveBeenCalled();
      expect(receta?.requisitos.map((requisito) => requisito.orden)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9,
      ]);
    });

    it('no guarda nada en caché si la receta no existe', async () => {
      const redis = new RedisFalso();

      const inexistente = await new RepositorioCatalogoConCache(
        crearInterno([], []),
        redis,
        240,
      ).obtener('LIC-01');

      expect(inexistente).toBeNull();
      expect(redis.llamadasSet).toHaveLength(0);
    });

    it('si Redis no está disponible, lee de la base sin propagar el error', async () => {
      const redis = new RedisFalso();
      redis.fallarGet = true;
      redis.fallarSet = true;
      const interno = crearInterno([]);

      const receta = await new RepositorioCatalogoConCache(interno, redis, 240).obtener('LIC-03');

      expect(interno.obtener).toHaveBeenCalledTimes(1);
      expect(receta?.codigo.valor).toBe('LIC-03');
      expect(advertencia).toHaveBeenCalledWith('Caché del catálogo no disponible');
    });

    it('ignora un valor corrupto en caché y consulta la base', async () => {
      const redis = new RedisFalso();
      redis.datos.set('catalogo:receta:LIC-03', '{"codigo":"LIC-03"}');
      const interno = crearInterno([]);

      const receta = await new RepositorioCatalogoConCache(interno, redis, 240).obtener('LIC-03');

      expect(interno.obtener).toHaveBeenCalledTimes(1);
      expect(receta?.codigo.valor).toBe('LIC-03');
    });
  });

  it('listarTodas no pasa por la caché (solo administración)', async () => {
    const redis = new RedisFalso();
    const interno = crearInterno([]);

    const recetas = await new RepositorioCatalogoConCache(interno, redis, 240).listarTodas();

    expect(recetas).toHaveLength(12);
    expect(redis.llamadasSet).toHaveLength(0);
  });
});
