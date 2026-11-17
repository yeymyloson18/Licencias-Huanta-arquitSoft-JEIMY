import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configurarAplicacion } from '../../src/configurar-aplicacion';
import type { SondaDependencia } from '../../src/operacion/salud/dominio/sonda-dependencia';
import { SONDA_BASE_DE_DATOS, SONDA_CACHE } from '../../src/operacion/salud/salud.module';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Requiere PostgreSQL y Redis (servicios del CI o Docker Compose local). Los casos de falla
// sustituyen las sondas para no depender de apagar contenedores (research.md §R-11);
// la caída real se comprueba en quickstart.md §2.
process.env.DATABASE_URL ??=
  'postgresql://licencias:cambiar_en_produccion_solo_desarrollo@localhost:5432/licencias';
process.env.REDIS_URL ??= 'redis://localhost:6379';

const falla: SondaDependencia = {
  comprobar: () =>
    Promise.reject(new Error('connect ECONNREFUSED postgresql://usuario:password@db')),
};
const seCuelga: SondaDependencia = { comprobar: () => new Promise<void>(() => undefined) };

const crearApp = async (
  sustitutos: { base?: SondaDependencia; cache?: SondaDependencia } = {},
): Promise<INestApplication> => {
  let constructor = Test.createTestingModule({ imports: [AppModule] });
  if (sustitutos.base) {
    constructor = constructor.overrideProvider(SONDA_BASE_DE_DATOS).useValue(sustitutos.base);
  }
  if (sustitutos.cache) {
    constructor = constructor.overrideProvider(SONDA_CACHE).useValue(sustitutos.cache);
  }
  const modulo = await constructor.compile();
  const app = modulo.createNestApplication({ logger: false });
  configurarAplicacion(app);
  await app.init();
  return app;
};

const consultarSalud = (app: INestApplication) =>
  request(app.getHttpServer() as Parameters<typeof request>[0]).get('/api/v1/salud');

const esperarRespuestaSegura = async (respuesta: request.Response): Promise<void> => {
  await esperarCumpleContrato('get', '/salud', respuesta);
  expect(respuesta.headers['cache-control']).toBe('no-store');
  expect(respuesta.headers['www-authenticate']).toBeUndefined();
  for (const prohibido of ['postgres', 'redis://', 'password', 'ECONNREFUSED', 'Error']) {
    expect(respuesta.text).not.toContain(prohibido);
  }
};

describe('GET /api/v1/salud', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('responde 200 OK con PostgreSQL y Redis reales, sin iniciar sesión', async () => {
    app = await crearApp();

    const respuesta = await consultarSalud(app);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ estado: 'OK', baseDeDatos: 'OK', cache: 'OK' });
    await esperarRespuestaSegura(respuesta);
  });

  it('responde 200 DEGRADADO si solo falla la caché', async () => {
    app = await crearApp({ cache: falla });

    const respuesta = await consultarSalud(app);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      estado: 'DEGRADADO',
      baseDeDatos: 'OK',
      cache: 'CAIDO',
    });
    await esperarRespuestaSegura(respuesta);
  });

  it('responde 503 CAIDO si falla la base de datos', async () => {
    app = await crearApp({ base: falla });

    const respuesta = await consultarSalud(app);

    expect(respuesta.status).toBe(503);
    expect(respuesta.body).toMatchObject({ estado: 'CAIDO', baseDeDatos: 'CAIDO', cache: 'OK' });
    await esperarRespuestaSegura(respuesta);
  });

  it('responde 503 en menos de 3 s si la base de datos no contesta (SC-003)', async () => {
    app = await crearApp({ base: seCuelga });

    const inicio = Date.now();
    const respuesta = await consultarSalud(app);
    const duracion = Date.now() - inicio;

    expect(respuesta.status).toBe(503);
    expect(respuesta.body).toMatchObject({ estado: 'CAIDO', baseDeDatos: 'CAIDO' });
    expect(duracion).toBeLessThan(3000);
    await esperarRespuestaSegura(respuesta);
  });
});
