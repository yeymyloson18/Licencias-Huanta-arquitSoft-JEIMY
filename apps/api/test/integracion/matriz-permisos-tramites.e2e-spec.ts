import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import type { Rol } from '../../src/modulos/seguridad/dominio/rol';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { PDF_PRUEBA } from '../apoyo/identidad-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// Matriz de permisos de Trámites (contracts/openapi-cambios.md de la 004, SC-003): quién puede
// usar cada operación, y que ningún 401/403 cambie datos.

type Operacion = (token: string | null) => request.Test;

describe('Matriz de permisos de Trámites (SC-003 de la 004)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let numero: string;
  const clientes = new Map<Rol, ClienteConSesion>();

  const con = (prueba: request.Test, token: string | null) =>
    token === null ? prueba : prueba.set('Authorization', `Bearer ${token}`);

  const LECTURAS: Record<string, Operacion> = {
    listarExpedientes: (token) =>
      con(request(app.getHttpServer()).get('/api/v1/expedientes'), token),
    obtenerExpediente: (token) =>
      con(request(app.getHttpServer()).get(`/api/v1/expedientes/${numero}`), token),
    descargarDocumento: (token) =>
      con(
        request(app.getHttpServer()).get(
          `/api/v1/expedientes/${numero}/documentos/${randomUUID()}`,
        ),
        token,
      ),
  };

  const ESCRITURAS: Record<string, Operacion> = {
    subirDocumento: (token) =>
      con(
        request(app.getHttpServer())
          .post('/api/v1/documentos')
          .attach('archivo', PDF_PRUEBA, 'solicitud.pdf'),
        token,
      ),
    presentarSolicitud: (token) =>
      con(
        request(app.getHttpServer())
          .post('/api/v1/expedientes')
          .set('Idempotency-Key', randomUUID())
          .send({}),
        token,
      ),
  };

  /** Lo que una operación rechazada no debe cambiar. */
  const contar = async () => ({
    expedientes: await prisma.expediente.count(),
    documentosTemporales: await prisma.documento_temporal.count(),
    auditoria: await prisma.auditoriaTramites.count(),
    eventos: await prisma.evento_pendiente.count(),
  });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
    numero = (await sembrarExpediente(prisma, app.get<ProtectorDatos>(PROTECTOR_DATOS))).numero;
    const roles: Rol[] = [
      'MESA_PARTES',
      'EVALUADOR',
      'JEFATURA',
      'INSPECTOR',
      'CAJA',
      'ADMINISTRADOR',
    ];
    for (const rol of roles) {
      clientes.set(rol, await clienteConRoles(app, prisma, redis, [rol]));
    }
  });

  afterAll(async () => {
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  const token = (rol: Rol) => clientes.get(rol)?.token ?? null;

  describe.each(Object.keys(LECTURAS))('%s', (nombre) => {
    const operar = (t: string | null) => (LECTURAS[nombre] as Operacion)(t);

    it('sin sesión → 401 sin cambiar datos', async () => {
      const antes = await contar();
      expect((await operar(null)).status).toBe(401);
      expect(await contar()).toEqual(antes);
    });

    it.each<Rol>(['INSPECTOR', 'CAJA', 'ADMINISTRADOR'])(
      '%s → 403 sin cambiar datos',
      async (rol) => {
        const antes = await contar();
        expect((await operar(token(rol))).status).toBe(403);
        expect(await contar()).toEqual(antes);
      },
    );

    it.each<Rol>(['MESA_PARTES', 'EVALUADOR', 'JEFATURA'])('%s tiene acceso', async (rol) => {
      const respuesta = await operar(token(rol));
      // La descarga usa un documento inexistente: pasa el control de roles y responde 404.
      expect(nombre === 'descargarDocumento' ? 404 : 200).toBe(respuesta.status);
    });
  });

  describe.each(Object.keys(ESCRITURAS))('%s', (nombre) => {
    const operar = (t: string | null) => (ESCRITURAS[nombre] as Operacion)(t);

    it('sin token → 401 sin cambiar datos', async () => {
      const antes = await contar();
      expect((await operar(null)).status).toBe(401);
      expect(await contar()).toEqual(antes);
    });

    it.each<Rol>(['EVALUADOR', 'JEFATURA', 'INSPECTOR', 'CAJA', 'ADMINISTRADOR'])(
      '%s → 403 sin cambiar datos',
      async (rol) => {
        const antes = await contar();
        expect((await operar(token(rol))).status).toBe(403);
        expect(await contar()).toEqual(antes);
      },
    );

    it('un token alterado → 401 sin cambiar datos', async () => {
      const antes = await contar();
      expect((await operar(`${token('MESA_PARTES') ?? ''}x`)).status).toBe(401);
      expect(await contar()).toEqual(antes);
    });
  });
});
