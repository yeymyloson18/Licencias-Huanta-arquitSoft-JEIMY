import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// FR-020 / SC-006: el sistema nunca queda sin administrador activo, aunque las operaciones lleguen
// a la vez (research.md §R-09: bloqueo de aplicación dentro de la transacción).

const TIPO = 'https://licencias.example.pe/errores/ultimo-administrador';
// Cada ronda crea dos administradores e inicia dos sesiones (argon2): 10 rondas superan los 5 s
// por defecto de Jest en equipos cargados.
const LIMITE_RONDAS_MS = 60_000;

describe('Nunca sin administrador activo (FR-020, SC-006)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;

  const administradoresActivos = () =>
    prisma.usuario.count({
      where: {
        activo: true,
        usuario_rol: { some: { rol_codigo: 'ADMINISTRADOR', retirado_en: null } },
      },
    });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
  });

  beforeEach(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('el único administrador no puede quitarse el rol ni desactivarse (409)', async () => {
    const admin = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
    const ruta = `/usuarios/${admin.usuario.id}`;

    const sinRol = await admin.pedir('put', `${ruta}/roles`, { roles: ['JEFATURA'] });
    expect(sinRol.status).toBe(409);
    expect(sinRol.body).toMatchObject({ type: TIPO });
    await esperarCumpleContrato('put', '/usuarios/{usuarioId}/roles', sinRol);

    const desactivado = await admin.pedir('patch', ruta, { activo: false });
    expect(desactivado.status).toBe(409);
    await esperarCumpleContrato('patch', '/usuarios/{usuarioId}', desactivado);

    await expect(administradoresActivos()).resolves.toBe(1);
  });

  it(
    'con dos administradores que se quitan su propio rol a la vez: exactamente un 200 y un 409 (x10)',
    async () => {
      for (let ronda = 0; ronda < 10; ronda += 1) {
        await limpiarSeguridad(prisma);
        await limpiarClavesSeguridad(redis);
        const a = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR', 'JEFATURA']);
        const b = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR', 'JEFATURA']);

        const respuestas = await Promise.all([
          a.pedir('put', `/usuarios/${a.usuario.id}/roles`, { roles: ['JEFATURA'] }),
          b.pedir('put', `/usuarios/${b.usuario.id}/roles`, { roles: ['JEFATURA'] }),
        ]);

        expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
        await expect(administradoresActivos()).resolves.toBe(1);
      }
    },
    LIMITE_RONDAS_MS,
  );

  it(
    'con dos administradores que se quitan el rol uno al otro a la vez, queda exactamente uno (x10)',
    async () => {
      for (let ronda = 0; ronda < 10; ronda += 1) {
        await limpiarSeguridad(prisma);
        await limpiarClavesSeguridad(redis);
        const a = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR', 'JEFATURA']);
        const b = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR', 'JEFATURA']);

        const respuestas = await Promise.all([
          a.pedir('put', `/usuarios/${b.usuario.id}/roles`, { roles: ['JEFATURA'] }),
          b.pedir('put', `/usuarios/${a.usuario.id}/roles`, { roles: ['JEFATURA'] }),
        ]);

        // Una gana (200). La otra recibe 409 (la regla) o 403 (si llegó cuando ya no era admin).
        const estados = respuestas.map((r) => r.status).sort();
        expect(estados[0]).toBe(200);
        expect([403, 409]).toContain(estados[1]);
        await expect(administradoresActivos()).resolves.toBe(1);
      }
    },
    LIMITE_RONDAS_MS,
  );
});
