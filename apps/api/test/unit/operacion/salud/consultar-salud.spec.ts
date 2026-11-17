import { ConsultarSalud } from '../../../../src/operacion/salud/aplicacion/consultar-salud';
import type { SondaDependencia } from '../../../../src/operacion/salud/dominio/sonda-dependencia';

const responde: SondaDependencia = { comprobar: () => Promise.resolve() };
const falla: SondaDependencia = { comprobar: () => Promise.reject(new Error('sin conexión')) };
const seCuelga = (): SondaDependencia & { llamadas: number } => {
  const sonda = {
    llamadas: 0,
    comprobar: () => {
      sonda.llamadas += 1;
      return new Promise<void>(() => undefined);
    },
  };
  return sonda;
};

const TIMEOUT = 2000;
const VERSION = '1.2.3';

describe('ConsultarSalud', () => {
  afterEach(() => jest.useRealTimers());

  it('informa OK si ambas dependencias responden', async () => {
    await expect(
      new ConsultarSalud(responde, responde, TIMEOUT, VERSION).ejecutar(),
    ).resolves.toEqual({
      estado: 'OK',
      baseDeDatos: 'OK',
      cache: 'OK',
      version: VERSION,
    });
  });

  it('informa DEGRADADO si solo falla la caché', async () => {
    await expect(new ConsultarSalud(responde, falla, TIMEOUT, VERSION).ejecutar()).resolves.toEqual(
      {
        estado: 'DEGRADADO',
        baseDeDatos: 'OK',
        cache: 'CAIDO',
        version: VERSION,
      },
    );
  });

  it('informa CAIDO si falla la base de datos', async () => {
    const resultado = await new ConsultarSalud(falla, responde, TIMEOUT, VERSION).ejecutar();

    expect(resultado).toMatchObject({ estado: 'CAIDO', baseDeDatos: 'CAIDO', cache: 'OK' });
  });

  it('considera CAIDO una sonda que no responde al cumplirse el tiempo límite', async () => {
    jest.useFakeTimers();
    const consulta = new ConsultarSalud(seCuelga(), responde, TIMEOUT, VERSION).ejecutar();

    await jest.advanceTimersByTimeAsync(TIMEOUT);

    await expect(consulta).resolves.toMatchObject({ estado: 'CAIDO', baseDeDatos: 'CAIDO' });
  });

  it('no da por caída una sonda antes del tiempo límite', async () => {
    jest.useFakeTimers();
    let terminado = false;
    const consulta = new ConsultarSalud(seCuelga(), responde, TIMEOUT, VERSION)
      .ejecutar()
      .then((resultado) => {
        terminado = true;
        return resultado;
      });

    await jest.advanceTimersByTimeAsync(TIMEOUT - 1);
    expect(terminado).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await expect(consulta).resolves.toMatchObject({ estado: 'CAIDO' });
  });

  it('consulta ambas dependencias en paralelo: el tiempo total no suma los dos límites', async () => {
    jest.useFakeTimers();
    const base = seCuelga();
    const cache = seCuelga();
    const consulta = new ConsultarSalud(base, cache, TIMEOUT, VERSION).ejecutar();

    expect(base.llamadas).toBe(1);
    expect(cache.llamadas).toBe(1);

    await jest.advanceTimersByTimeAsync(TIMEOUT);

    await expect(consulta).resolves.toMatchObject({
      estado: 'CAIDO',
      baseDeDatos: 'CAIDO',
      cache: 'CAIDO',
    });
  });

  it('no deja temporizadores pendientes cuando las sondas responden', async () => {
    jest.useFakeTimers();

    await new ConsultarSalud(responde, responde, TIMEOUT, VERSION).ejecutar();

    expect(jest.getTimerCount()).toBe(0);
  });
});
