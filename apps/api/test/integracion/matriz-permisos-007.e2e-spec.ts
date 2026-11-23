import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { ROLES, type Rol } from '../../src/modulos/seguridad/dominio/rol';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// Matriz de permisos de la 007 (SC-003): el tablero y el reporte (JSON y CSV) responden 401 sin sesión
// y 403 a cada rol que no es JEFATURA, sin calcular nada ni dejar resultados en la caché.

interface Operacion {
  readonly ruta: string;
  readonly roles: readonly Rol[];
}

const OPERACIONES: Record<string, Operacion> = {
  tablero: { ruta: '/reportes/tablero', roles: ['JEFATURA'] },
  tableroConRango: {
    ruta: '/reportes/tablero?desde=2026-10-01&hasta=2026-10-31',
    roles: ['JEFATURA'],
  },
  reporteJson: { ruta: '/reportes/licencias?situacion=VIGENTES', roles: ['JEFATURA'] },
  reporteCsv: {
    ruta: '/reportes/licencias?situacion=EN_TRAMITE&formato=csv',
    roles: ['JEFATURA'],
  },
};

describe('Matriz de permisos del tablero y los reportes (SC-003 de la 007)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  const clientes = new Map<Rol, ClienteConSesion>();

  const pedir = (ruta: string, token: string | null) => {
    const prueba = request(app.getHttpServer()).get(`/api/v1${ruta}`);
    return token === null ? prueba : prueba.set('Authorization', `Bearer ${token}`);
  };

  const clavesDeCache = () => redis.keys('rep:*');

  const limpiarCache = async () => {
    for (const clave of await clavesDeCache()) {
      await redis.del(clave);
    }
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    await limpiarClavesSeguridad(redis);
    for (const rol of ROLES) {
      clientes.set(rol, await clienteConRoles(app, prisma, redis, [rol]));
    }
  });

  beforeEach(async () => {
    await limpiarCache();
  });

  afterAll(async () => {
    await limpiarCache();
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  describe.each(Object.keys(OPERACIONES))('%s', (nombre) => {
    const operacion = OPERACIONES[nombre] as Operacion;
    const prohibidos = ROLES.filter((rol) => !operacion.roles.includes(rol));

    it('sin sesión → 401 sin calcular ni guardar en caché', async () => {
      const respuesta = await pedir(operacion.ruta, null);

      expect(respuesta.status).toBe(401);
      expect(await clavesDeCache()).toEqual([]);
    });

    it.each(prohibidos)('%s → 403 sin calcular ni guardar en caché', async (rol) => {
      const respuesta = await pedir(operacion.ruta, clientes.get(rol)?.token ?? null);

      expect(respuesta.status).toBe(403);
      expect(respuesta.headers['content-disposition']).toBeUndefined();
      expect(await clavesDeCache()).toEqual([]);
    });

    it('JEFATURA → 200', async () => {
      const respuesta = await pedir(operacion.ruta, clientes.get('JEFATURA')?.token ?? null);

      expect(respuesta.status).toBe(200);
    });
  });
});
