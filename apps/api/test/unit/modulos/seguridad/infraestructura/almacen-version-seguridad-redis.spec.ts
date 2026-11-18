import type Redis from 'ioredis';
import type {
  EventoSeguridad,
  IdsEvento,
  RegistroEventosSeguridad,
} from '../../../../../src/modulos/seguridad/dominio/puertos/registro-eventos-seguridad';
import { AlmacenVersionSeguridadRedis } from '../../../../../src/modulos/seguridad/infraestructura/almacen-version-seguridad-redis';

class EventosFalsos implements RegistroEventosSeguridad {
  readonly registrados: [EventoSeguridad, IdsEvento | undefined][] = [];
  registrar(evento: EventoSeguridad, ids?: IdsEvento): void {
    this.registrados.push([evento, ids]);
  }
}

const redisFalso = (opciones: { mget?: (string | null)[]; falla?: boolean } = {}) => {
  const llamadas: unknown[][] = [];
  const pipelineLlamadas: unknown[][] = [];
  const fallar = <T>(valor: T): Promise<T> =>
    opciones.falla === true ? Promise.reject(new Error('redis caído')) : Promise.resolve(valor);
  const redis = {
    mget: (...claves: unknown[]) => {
      llamadas.push(['mget', ...claves]);
      return fallar(opciones.mget ?? [null, null]);
    },
    set: (...argumentos: unknown[]) => {
      llamadas.push(['set', ...argumentos]);
      return fallar('OK');
    },
    pipeline: () => {
      const pipeline = {
        set: (...argumentos: unknown[]) => {
          pipelineLlamadas.push(argumentos);
          return pipeline;
        },
        exec: () => fallar(pipelineLlamadas.map(() => [null, 'OK'])),
      };
      return pipeline;
    },
  } as unknown as Redis;
  return { redis, llamadas, pipelineLlamadas };
};

describe('AlmacenVersionSeguridadRedis', () => {
  it('lee la versión y la marca de sesión revocada en un solo MGET', async () => {
    const { redis, llamadas } = redisFalso({ mget: ['7', '1'] });

    const estado = await new AlmacenVersionSeguridadRedis(redis, new EventosFalsos()).leerEstado(
      'u-1',
      's-1',
    );

    expect(estado).toEqual({ version: 7, sesionRevocada: true });
    expect(llamadas).toEqual([['mget', 'seg:version:u-1', 'seg:sesion-revocada:s-1']]);
  });

  it('sin claves devuelve versión nula y sesión no revocada', async () => {
    const { redis } = redisFalso({ mget: [null, null] });

    await expect(
      new AlmacenVersionSeguridadRedis(redis, new EventosFalsos()).leerEstado('u-1', 's-1'),
    ).resolves.toEqual({ version: null, sesionRevocada: false });
  });

  it('si Redis falla al leer devuelve null ("desconocido")', async () => {
    const { redis } = redisFalso({ falla: true });

    await expect(
      new AlmacenVersionSeguridadRedis(redis, new EventosFalsos()).leerEstado('u-1', 's-1'),
    ).resolves.toBeNull();
  });

  it('publica la versión con 60 s de vida', async () => {
    const { redis, llamadas } = redisFalso();

    await new AlmacenVersionSeguridadRedis(redis, new EventosFalsos()).publicarVersion('u-1', 8);

    expect(llamadas).toEqual([['set', 'seg:version:u-1', '8', 'EX', 60]]);
  });

  it('marca cada sesión revocada con 900 s de vida en un pipeline', async () => {
    const { redis, pipelineLlamadas } = redisFalso();

    await new AlmacenVersionSeguridadRedis(redis, new EventosFalsos()).marcarSesionesRevocadas([
      's-1',
      's-2',
    ]);

    expect(pipelineLlamadas).toEqual([
      ['seg:sesion-revocada:s-1', '1', 'EX', 900],
      ['seg:sesion-revocada:s-2', '1', 'EX', 900],
    ]);
  });

  it('sin sesiones no hace nada', async () => {
    const { redis, pipelineLlamadas } = redisFalso();

    await new AlmacenVersionSeguridadRedis(redis, new EventosFalsos()).marcarSesionesRevocadas([]);

    expect(pipelineLlamadas).toEqual([]);
  });

  it('si Redis falla al escribir no lanza y registra el evento fallo-cache-seguridad', async () => {
    const { redis } = redisFalso({ falla: true });
    const eventos = new EventosFalsos();
    const almacen = new AlmacenVersionSeguridadRedis(redis, eventos);

    await expect(almacen.publicarVersion('u-1', 8)).resolves.toBeUndefined();
    await expect(almacen.marcarSesionesRevocadas(['s-1'])).resolves.toBeUndefined();

    expect(eventos.registrados).toEqual([
      ['fallo-cache-seguridad', { usuarioId: 'u-1' }],
      ['fallo-cache-seguridad', { sesionId: 's-1' }],
    ]);
  });
});
