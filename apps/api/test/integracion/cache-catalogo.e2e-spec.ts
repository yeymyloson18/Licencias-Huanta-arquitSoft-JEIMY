import { once } from 'node:events';
import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import {
  crearAplicacionDePrueba,
  type AplicacionDePrueba,
  type LoggerCapturador,
} from '../apoyo/aplicacion-prueba';
import {
  borrarCacheCatalogo,
  fotografiarRecetas,
  restaurarRecetas,
  type FotoRecetas,
} from '../apoyo/catalogo-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// FR-024 / research §R-06 de la 003: un cambio se ve en la siguiente consulta, y como máximo en
// 5 minutos (240 s de Redis + 60 s del navegador) aunque falle la invalidación.

interface Contexto {
  app: INestApplication<App>;
  logger: LoggerCapturador;
  prisma: PrismaServicio;
  redis: Redis;
  admin: ClienteConSesion;
  foto: FotoRecetas;
}

const preparar = async (aplicacion: AplicacionDePrueba): Promise<Contexto> => {
  const app = aplicacion.app as INestApplication<App>;
  const prisma = app.get(PrismaServicio);
  const redis = app.get<Redis>(REDIS_CLIENTE);
  if (redis.status !== 'ready') {
    await once(redis, 'ready');
  }
  await limpiarSeguridad(prisma);
  await limpiarClavesSeguridad(redis);
  return {
    app,
    logger: aplicacion.logger,
    prisma,
    redis,
    admin: await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']),
    foto: await fotografiarRecetas(prisma, ['LIC-02']),
  };
};

const cerrar = async ({ app, prisma, redis, foto }: Contexto) => {
  await restaurarRecetas(prisma, redis, foto);
  await limpiarSeguridad(prisma);
  await limpiarClavesSeguridad(redis);
  await app.close();
};

const leer = (app: INestApplication<App>, ruta: string) =>
  request(app.getHttpServer()).get(`/api/v1${ruta}`);

describe('Caché del catálogo al editar una receta (FR-024)', () => {
  describe('con Redis disponible', () => {
    let contexto: Contexto;

    beforeAll(async () => {
      contexto = await preparar(await crearAplicacionDePrueba());
      await borrarCacheCatalogo(contexto.redis);
    });
    afterAll(async () => {
      await cerrar(contexto);
    });

    it('el PUT borra la ficha y las listas, y la siguiente lectura ya muestra el valor nuevo', async () => {
      const { app, redis, admin } = contexto;
      await leer(app, '/catalogo/recetas/LIC-02');
      await leer(app, '/catalogo/recetas?tipo=LICENCIA');
      await leer(app, '/catalogo/recetas');
      expect(await redis.exists('catalogo:receta:LIC-02')).toBe(1);
      expect(await redis.exists('catalogo:recetas:LICENCIA', 'catalogo:recetas:TODOS')).toBe(2);

      const respuesta = await admin.pedir('put', '/catalogo/recetas/LIC-02', { tasa: '185.00' });

      expect(respuesta.status).toBe(200);
      expect(
        await redis.exists(
          'catalogo:receta:LIC-02',
          'catalogo:recetas:LICENCIA',
          'catalogo:recetas:TODOS',
          'catalogo:recetas:TRAMITE_CONECTADO',
        ),
      ).toBe(0);
      expect((await leer(app, '/catalogo/recetas/LIC-02')).body).toMatchObject({
        tasa: '185.00',
      });
      const lista = (await leer(app, '/catalogo/recetas?tipo=LICENCIA')).body as {
        codigo: string;
        tasa: string;
      }[];
      expect(lista.find((receta) => receta.codigo === 'LIC-02')?.tasa).toBe('185.00');
    });
  });

  describe('peor caso: Redis falla al borrar', () => {
    let contexto: Contexto;
    let delOriginal: Redis['del'];

    beforeAll(async () => {
      contexto = await preparar(await crearAplicacionDePrueba());
      await borrarCacheCatalogo(contexto.redis);
      // El cliente de la aplicación falla al borrar claves del catálogo; la sesión sigue funcionando.
      const { redis } = contexto;
      delOriginal = redis.del.bind(redis);
      redis.del = ((...claves: string[]) =>
        claves.some((clave) => clave.startsWith('catalogo:'))
          ? Promise.reject(new Error('Redis no disponible'))
          : delOriginal(...claves)) as Redis['del'];
    });
    afterAll(async () => {
      contexto.redis.del = delOriginal;
      await cerrar(contexto);
    });

    it('el PUT responde 200, deja un aviso y la ficha vieja vence en 240 s + 60 s como máximo', async () => {
      const { app, admin, logger } = contexto;
      const ficha = await leer(app, '/catalogo/recetas/LIC-02');
      expect(ficha.headers['cache-control']).toBe('public, max-age=60');

      const respuesta = await admin.pedir('put', '/catalogo/recetas/LIC-02', { tasa: '186.00' });

      expect(respuesta.status).toBe(200);
      expect(logger.lineas).toContainEqual(
        expect.stringContaining('Caché del catálogo no disponible al invalidar codigo=LIC-02'),
      );
      const ttl = await contexto.redis.ttl('catalogo:receta:LIC-02');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(240);
    });
  });
});
