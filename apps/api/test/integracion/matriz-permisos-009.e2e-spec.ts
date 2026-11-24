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
import { crearUsuarioDePrueba, type UsuarioDePrueba } from '../apoyo/usuarios-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Matriz de permisos de la 009 (FR-021, SC-006): las 5 operaciones del administrador responden 401
// sin sesión y 403 a cada uno de los otros 5 roles, sin cerrar sesiones, desbloquear ni registrar
// nada en la auditoría.

type Metodo = 'get' | 'post';

interface Operacion {
  readonly metodo: Metodo;
  readonly ruta: (usuarioId: string) => string;
  readonly contrato: string;
  readonly exito: number;
}

const OPERACIONES: Record<string, Operacion> = {
  panel: { metodo: 'get', ruta: () => '/admin/panel', contrato: '/admin/panel', exito: 200 },
  auditoria: {
    metodo: 'get',
    ruta: () => '/admin/auditoria',
    contrato: '/admin/auditoria',
    exito: 200,
  },
  auditoriaCsv: {
    metodo: 'get',
    ruta: () => '/admin/auditoria?formato=csv',
    contrato: '/admin/auditoria',
    exito: 200,
  },
  ficha: {
    metodo: 'get',
    ruta: (id) => `/usuarios/${id}`,
    contrato: '/usuarios/{usuarioId}',
    exito: 200,
  },
  cerrarSesiones: {
    metodo: 'post',
    ruta: (id) => `/usuarios/${id}/cerrar-sesiones`,
    contrato: '/usuarios/{usuarioId}/cerrar-sesiones',
    exito: 200,
  },
  desbloquear: {
    metodo: 'post',
    ruta: (id) => `/usuarios/${id}/desbloquear`,
    contrato: '/usuarios/{usuarioId}/desbloquear',
    exito: 204,
  },
};

describe('Matriz de permisos del administrador (009)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let objetivo: UsuarioDePrueba;
  const clientes = new Map<Rol, ClienteConSesion>();

  const pedir = (operacion: Operacion, token: string | null) => {
    const prueba = request(app.getHttpServer())[operacion.metodo](
      `/api/v1${operacion.ruta(objetivo.id)}`,
    );
    return token === null ? prueba : prueba.set('Authorization', `Bearer ${token}`);
  };

  /** Lo que una operación permitida cambiaría: auditoría del objetivo y sus sesiones. */
  const fotografia = async () => ({
    auditoria: await prisma.auditoriaSeguridad.count({
      where: { afectado_usuario_id: objetivo.id },
    }),
    sesionesRevocadas: await prisma.sesion.count({
      where: { usuario_id: objetivo.id, revocada_en: { not: null } },
    }),
  });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    for (const rol of ROLES) {
      clientes.set(rol, await clienteConRoles(app, prisma, redis, [rol]));
    }
    objetivo = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  describe.each(Object.keys(OPERACIONES))('%s', (nombre) => {
    const operacion = OPERACIONES[nombre] as Operacion;
    const prohibidos = ROLES.filter((rol) => rol !== 'ADMINISTRADOR');

    it('sin sesión → 401 sin cambiar nada', async () => {
      const antes = await fotografia();

      const respuesta = await pedir(operacion, null);

      expect(respuesta.status).toBe(401);
      await esperarCumpleContrato(operacion.metodo, operacion.contrato, respuesta);
      expect(await fotografia()).toEqual(antes);
    });

    it.each(prohibidos)('%s → 403 sin cambiar nada', async (rol) => {
      const antes = await fotografia();

      const respuesta = await pedir(operacion, clientes.get(rol)?.token ?? null);

      expect(respuesta.status).toBe(403);
      expect(respuesta.headers['content-disposition']).toBeUndefined();
      expect(await fotografia()).toEqual(antes);
    });

    it(`ADMINISTRADOR → ${String(operacion.exito)}`, async () => {
      const respuesta = await pedir(operacion, clientes.get('ADMINISTRADOR')?.token ?? null);

      expect(respuesta.status).toBe(operacion.exito);
    });
  });
});
