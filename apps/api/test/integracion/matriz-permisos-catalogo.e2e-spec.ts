import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { ROLES, type Rol } from '../../src/modulos/seguridad/dominio/rol';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { fotografiarRecetas, restaurarRecetas, type FotoRecetas } from '../apoyo/catalogo-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// FR-015 / contracts/catalogo-admin.md de la 003: la gestión del catálogo es solo para ADMINISTRADOR.
// Cada 401/403 deja la receta igual y no agrega filas a cambio_receta.

interface Operacion {
  readonly nombre: string;
  readonly metodo: 'get' | 'put';
  readonly ruta: string;
  readonly rutaContrato: string;
  readonly cuerpo?: object;
}

const OPERACIONES: readonly Operacion[] = [
  {
    nombre: 'listarRecetasAdmin',
    metodo: 'get',
    ruta: '/admin/catalogo/recetas',
    rutaContrato: '/admin/catalogo/recetas',
  },
  {
    nombre: 'obtenerRecetaAdmin',
    metodo: 'get',
    ruta: '/admin/catalogo/recetas/LIC-02',
    rutaContrato: '/admin/catalogo/recetas/{codigoReceta}',
  },
  {
    nombre: 'actualizarReceta',
    metodo: 'put',
    ruta: '/catalogo/recetas/LIC-02',
    rutaContrato: '/catalogo/recetas/{codigoReceta}',
    cuerpo: { tasa: '180.00' },
  },
];

describe('Matriz de permisos del catálogo (FR-015, historia 3 de la 003)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;
  let foto: FotoRecetas;
  const clientes = new Map<Rol, ClienteConSesion>();

  /** Huella de LIC-02 y del registro de cambios. */
  const huella = async () => {
    const [receta, cambios] = await Promise.all([
      prisma.receta.findUniqueOrThrow({ where: { codigo: 'LIC-02' } }),
      prisma.cambio_receta.count(),
    ]);
    return `${receta.tasa.toFixed(2)}|${receta.actualizada_en.toISOString()}|${String(cambios)}`;
  };

  const pedir = (cliente: ClienteConSesion, operacion: Operacion) =>
    cliente.pedir(operacion.metodo, operacion.ruta, operacion.cuerpo);

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    foto = await fotografiarRecetas(prisma, ['LIC-02']);
    for (const rol of ROLES) {
      clientes.set(rol, await clienteConRoles(app, prisma, redis, [rol]));
    }
  });

  afterEach(async () => {
    await restaurarRecetas(prisma, redis, foto);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  describe.each(OPERACIONES)('$nombre', (operacion) => {
    it('sin token responde 401 y no cambia nada', async () => {
      const antes = await huella();
      const peticion = request(app.getHttpServer())[operacion.metodo](`/api/v1${operacion.ruta}`);

      const respuesta = await (operacion.cuerpo ? peticion.send(operacion.cuerpo) : peticion);

      expect(respuesta.status).toBe(401);
      await esperarCumpleContrato(operacion.metodo, operacion.rutaContrato, respuesta);
      await expect(huella()).resolves.toBe(antes);
    });

    it.each(ROLES.filter((rol) => rol !== 'ADMINISTRADOR'))(
      'con el rol %s responde 403 y no cambia nada',
      async (rol) => {
        const antes = await huella();
        const cliente = clientes.get(rol);
        if (!cliente) throw new Error(`Falta el cliente con el rol ${rol}`);

        const respuesta = await pedir(cliente, operacion);

        expect(respuesta.status).toBe(403);
        await esperarCumpleContrato(operacion.metodo, operacion.rutaContrato, respuesta);
        await expect(huella()).resolves.toBe(antes);
      },
    );

    it('con el rol ADMINISTRADOR responde 200 con no-store', async () => {
      const cliente = clientes.get('ADMINISTRADOR');
      if (!cliente) throw new Error('Falta el cliente administrador');

      const respuesta = await pedir(cliente, operacion);

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['cache-control']).toBe('no-store');
      await esperarCumpleContrato(operacion.metodo, operacion.rutaContrato, respuesta);
    });
  });

  it('si otro administrador le retira el rol, el mismo token ya no puede guardar (efecto inmediato)', async () => {
    const editor = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
    const otro = clientes.get('ADMINISTRADOR');
    if (!otro) throw new Error('Falta el cliente administrador');
    expect((await editor.pedir('get', '/admin/catalogo/recetas/LIC-02')).status).toBe(200);

    const retiro = await otro.pedir('put', `/usuarios/${editor.usuario.id}/roles`, {
      roles: ['CAJA'],
    });
    expect(retiro.status).toBe(200);
    const antes = await huella();

    const respuesta = await editor.pedir('put', '/catalogo/recetas/LIC-02', { tasa: '199.00' });

    expect(respuesta.status).toBe(403);
    await esperarCumpleContrato('put', '/catalogo/recetas/{codigoReceta}', respuesta);
    await expect(huella()).resolves.toBe(antes);
  });

  it('el PUT protegido no cambia el GET público de la misma ruta', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/v1/catalogo/recetas/LIC-02');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('public, max-age=60');
  });
});
