import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { crearUsuarioDePrueba } from '../apoyo/usuarios-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Panel del administrador y ficha del usuario (HU1 y HU3 de la 009). La auditoría no se puede
// borrar: las cifras de ingresos fallidos se comparan como diferencias antes/después.

interface PanelApi {
  usuarios: { activos: number; inactivos: number };
  porRol: Record<string, number>;
  bloqueos: { cuentas: number; origenes: number } | null;
  sesionesAbiertas: number;
  ingresosFallidos: { hoy: number; ultimos7Dias: number };
  ultimosEventos: { accion: string }[];
}

describe('Panel del administrador (009)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;
  let admin: ClienteConSesion;

  const intentar = (correo: string, clave: string, origen: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/iniciar-sesion')
      .set('X-Forwarded-For', origen)
      .send({ correo, clave });

  const panel = async (): Promise<PanelApi> => {
    const respuesta = await admin.pedir('get', '/admin/panel').expect(200);
    await esperarCumpleContrato('get', '/admin/panel', respuesta);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    return respuesta.body as PanelApi;
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    admin = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
  });

  beforeEach(async () => {
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('cuenta usuarios activos e inactivos, por rol, y la sesión abierta del administrador', async () => {
    await crearUsuarioDePrueba(prisma, { roles: ['CAJA', 'EVALUADOR'] });
    await crearUsuarioDePrueba(prisma, { roles: ['INSPECTOR'], activo: false });

    const cifras = await panel();

    expect(cifras.usuarios).toEqual({ activos: 2, inactivos: 1 });
    expect(cifras.porRol).toEqual({
      MESA_PARTES: 0,
      EVALUADOR: 1,
      INSPECTOR: 0,
      CAJA: 1,
      JEFATURA: 0,
      ADMINISTRADOR: 1,
    });
    expect(cifras.sesionesAbiertas).toBeGreaterThanOrEqual(1);
    expect(cifras.bloqueos).toEqual({ cuentas: 0, origenes: 0 });
  });

  it('una cuenta bloqueada cuenta 1; un correo inventado bloqueado no es una cuenta', async () => {
    const antes = await panel();
    const bloqueada = await crearUsuarioDePrueba(prisma);
    for (let i = 0; i < 5; i += 1) {
      await intentar(bloqueada.correo, 'Equivocada2026', `10.8.0.${String(i)}`).expect(401);
      await intentar('inventado.009@ejemplo.pe', 'Equivocada2026', `10.8.1.${String(i)}`).expect(
        401,
      );
    }

    const despues = await panel();

    expect(despues.bloqueos).toEqual({ cuentas: 1, origenes: 0 });
    expect(despues.ingresosFallidos.hoy - antes.ingresosFallidos.hoy).toBe(10);
    expect(despues.ingresosFallidos.ultimos7Dias - antes.ingresosFallidos.ultimos7Dias).toBe(10);
    expect(despues.ultimosEventos[0]?.accion).toBe('CLAVE_INCORRECTA');
  });

  it('5 fallos desde un mismo origen cuentan como un origen bloqueado', async () => {
    for (let i = 0; i < 5; i += 1) {
      await intentar(`origen${String(i)}.009@ejemplo.pe`, 'Equivocada2026', '10.8.2.1').expect(401);
    }

    expect((await panel()).bloqueos).toEqual({ cuentas: 0, origenes: 1 });
  });

  it('con 10,000 eventos, el panel y la primera página de la auditoría responden en menos de 2 s (SC-001)', async () => {
    // Una sola sentencia; eventos de días pasados para no cambiar las cifras de "hoy".
    await prisma.$executeRaw`
      INSERT INTO seguridad.auditoria (ocurrido_en, accion, resultado)
      SELECT now() - interval '2 days' - (n * interval '37 minutes'), 'CIERRE_SESION', 'EXITO'
        FROM generate_series(1, 10000) AS n`;

    const inicioPanel = Date.now();
    await panel();
    const msPanel = Date.now() - inicioPanel;

    const inicioLista = Date.now();
    const lista = await admin.pedir('get', '/admin/auditoria').expect(200);
    const msLista = Date.now() - inicioLista;

    expect((lista.body as { total: number }).total).toBeGreaterThan(20);
    expect(msPanel).toBeLessThan(2000);
    expect(msLista).toBeLessThan(2000);
  });
});
