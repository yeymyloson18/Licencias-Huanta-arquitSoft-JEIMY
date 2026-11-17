import { Logger } from '@nestjs/common';
import {
  crearReceta,
  type Receta,
  type TipoReceta,
} from '../../../../../src/modulos/catalogo/dominio/receta';
import type { RepositorioCatalogo } from '../../../../../src/modulos/catalogo/dominio/repositorio-catalogo';
import {
  RepositorioCatalogoConCache,
  type ClienteCache,
} from '../../../../../src/modulos/catalogo/infraestructura/repositorio-catalogo-con-cache';

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

const crearInterno = (recetas: Receta[]) => {
  const interno = {
    listarActivas: jest.fn((filtro: { tipo?: TipoReceta }) =>
      Promise.resolve(recetas.filter((r) => filtro.tipo === undefined || r.tipo === filtro.tipo)),
    ),
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

    const resultado = await new RepositorioCatalogoConCache(interno, redis, 300).listarActivas({
      tipo: 'LICENCIA',
    });

    expect(interno.listarActivas).not.toHaveBeenCalled();
    expect(resultado.map(aPlano)).toEqual([aPlano(lic01)]);
  });

  it('si la clave no está, consulta la base y guarda el resultado con TTL de 300 s', async () => {
    const redis = new RedisFalso();
    const interno = crearInterno([lic01, trf01]);

    const resultado = await new RepositorioCatalogoConCache(interno, redis, 300).listarActivas({
      tipo: 'LICENCIA',
    });

    expect(interno.listarActivas).toHaveBeenCalledWith({ tipo: 'LICENCIA' });
    expect(resultado.map(aPlano)).toEqual([aPlano(lic01)]);
    expect(redis.llamadasSet).toEqual([
      ['catalogo:recetas:LICENCIA', JSON.stringify([aPlano(lic01)]), 'EX', 300],
    ]);
  });

  it('usa la clave TODOS sin filtro y conserva los null', async () => {
    const redis = new RedisFalso();

    await new RepositorioCatalogoConCache(crearInterno([lic01, trf01]), redis, 300).listarActivas(
      {},
    );

    expect(redis.llamadasSet[0]?.[0]).toBe('catalogo:recetas:TODOS');
    const guardado = JSON.parse(String(redis.llamadasSet[0]?.[1])) as unknown[];
    expect(guardado).toEqual([aPlano(lic01), aPlano(trf01)]);
  });

  it('una segunda consulta sale de la caché', async () => {
    const redis = new RedisFalso();
    const interno = crearInterno([lic01]);
    const repositorio = new RepositorioCatalogoConCache(interno, redis, 300);

    await repositorio.listarActivas({});
    const segunda = await repositorio.listarActivas({});

    expect(interno.listarActivas).toHaveBeenCalledTimes(1);
    expect(segunda.map(aPlano)).toEqual([aPlano(lic01)]);
  });

  it('si leer de Redis falla, consulta la base sin propagar el error', async () => {
    const redis = new RedisFalso();
    redis.fallarGet = true;
    const interno = crearInterno([lic01]);

    const resultado = await new RepositorioCatalogoConCache(interno, redis, 300).listarActivas({});

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
      300,
    ).listarActivas({});

    expect(resultado.map(aPlano)).toEqual([aPlano(lic01)]);
    expect(advertencia).toHaveBeenCalledWith('Caché del catálogo no disponible');
  });

  it('ignora un valor de caché corrupto y consulta la base', async () => {
    const redis = new RedisFalso();
    redis.datos.set('catalogo:recetas:TODOS', '{no es json');
    const interno = crearInterno([lic01]);

    const resultado = await new RepositorioCatalogoConCache(interno, redis, 300).listarActivas({});

    expect(interno.listarActivas).toHaveBeenCalledTimes(1);
    expect(resultado.map(aPlano)).toEqual([aPlano(lic01)]);
  });

  it('respeta el TTL configurado', async () => {
    const redis = new RedisFalso();

    await new RepositorioCatalogoConCache(crearInterno([lic01]), redis, 60).listarActivas({});

    expect(redis.llamadasSet[0]?.[3]).toBe(60);
  });
});
