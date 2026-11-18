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
import { crearUsuarioDePrueba } from '../apoyo/usuarios-prueba';

// SC-002 / EQ-04: matriz de permisos de la gestión de usuarios (docs/06-contrato-api/README.md,
// fila "Gestionar usuarios y roles (RF22)": solo ADMINISTRADOR). Cada 401/403 no modifica datos.

interface Operacion {
  readonly nombre: string;
  readonly metodo: 'get' | 'post' | 'patch' | 'put';
  readonly ruta: (objetivo: string) => string;
  readonly cuerpo: (indice: number) => object | undefined;
}

const OPERACIONES: readonly Operacion[] = [
  { nombre: 'listarUsuarios', metodo: 'get', ruta: () => '/usuarios', cuerpo: () => undefined },
  {
    nombre: 'buscarUsuarios',
    metodo: 'post',
    ruta: () => '/usuarios/busqueda',
    cuerpo: () => ({ texto: 'Persona' }),
  },
  {
    nombre: 'crearUsuario',
    metodo: 'post',
    ruta: () => '/usuarios',
    cuerpo: (i) => ({
      correo: `matriz${String(i)}@ejemplo.pe`,
      nombreCompleto: 'Persona de la Matriz',
      celular: '912345678',
      claveTemporal: 'ClaveTemporal2026',
      roles: ['CAJA'],
    }),
  },
  {
    nombre: 'actualizarUsuario',
    metodo: 'patch',
    ruta: (id) => `/usuarios/${id}`,
    cuerpo: (i) => ({ nombreCompleto: `Nombre Cambiado ${String(i)}` }),
  },
  {
    nombre: 'asignarRoles',
    metodo: 'put',
    ruta: (id) => `/usuarios/${id}/roles`,
    cuerpo: () => ({ roles: ['CAJA', 'INSPECTOR'] }),
  },
  {
    nombre: 'asignarClaveTemporal',
    metodo: 'post',
    ruta: (id) => `/usuarios/${id}/clave-temporal`,
    cuerpo: () => ({ claveTemporal: 'ClaveTemporalOtra2026' }),
  },
];

describe('Matriz de permisos de la gestión de usuarios (SC-002, EQ-04)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;
  const clientes = new Map<Rol, ClienteConSesion>();
  let objetivo: string;

  /** Huella del estado de seguridad.usuario: cantidad y última actualización. */
  const huellaBase = async () => {
    const [cantidad, ultima] = await Promise.all([
      prisma.usuario.count(),
      prisma.usuario.aggregate({ _max: { actualizado_en: true } }),
    ]);
    return `${String(cantidad)}|${ultima._max.actualizado_en?.toISOString() ?? '-'}`;
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    for (const rol of ROLES) {
      clientes.set(rol, await clienteConRoles(app, prisma, redis, [rol]));
    }
    objetivo = (await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] })).id;
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  describe.each(OPERACIONES)('$nombre', (operacion) => {
    it('sin token responde 401 y no modifica datos', async () => {
      const antes = await huellaBase();
      const peticion = request(app.getHttpServer())[operacion.metodo](
        `/api/v1${operacion.ruta(objetivo)}`,
      );
      const cuerpo = operacion.cuerpo(0);

      const respuesta = await (cuerpo === undefined ? peticion : peticion.send(cuerpo));

      expect(respuesta.status).toBe(401);
      await expect(huellaBase()).resolves.toBe(antes);
    });

    it.each(ROLES.filter((rol) => rol !== 'ADMINISTRADOR'))(
      'con el rol %s responde 403 y no modifica datos',
      async (rol) => {
        const antes = await huellaBase();
        const cliente = clientes.get(rol);

        const respuesta = await cliente?.pedir(
          operacion.metodo,
          operacion.ruta(objetivo),
          operacion.cuerpo(ROLES.indexOf(rol)),
        );

        expect(respuesta?.status).toBe(403);
        expect(respuesta?.body).toMatchObject({
          type: 'https://licencias.example.pe/errores/sin-permiso',
        });
        await expect(huellaBase()).resolves.toBe(antes);
      },
    );

    it('con el rol ADMINISTRADOR responde 2xx', async () => {
      const respuesta = await clientes
        .get('ADMINISTRADOR')
        ?.pedir(operacion.metodo, operacion.ruta(objetivo), operacion.cuerpo(99));

      expect(respuesta?.status).toBeGreaterThanOrEqual(200);
      expect(respuesta?.status).toBeLessThan(300);
    });
  });
});
