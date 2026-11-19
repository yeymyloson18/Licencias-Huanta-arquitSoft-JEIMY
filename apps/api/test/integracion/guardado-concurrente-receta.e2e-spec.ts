import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { fotografiarRecetas, restaurarRecetas, type FotoRecetas } from '../apoyo/catalogo-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// FR-023 y aclaración 5 de la 003: sin detección de conflictos, gana el último que guarda y cada
// guardado tiene su registro; el "antes" de cada uno es lo guardado en ese momento.

interface CambioTasa {
  tasa: { antes: string; despues: string };
}

describe('Dos administradores guardan la misma receta a la vez (FR-023)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;
  let foto: FotoRecetas;
  let primero: ClienteConSesion;
  let segundo: ClienteConSesion;

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    foto = await fotografiarRecetas(prisma, ['LIC-02']);
    await restaurarRecetas(prisma, redis, foto);
    primero = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
    segundo = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
  });

  afterAll(async () => {
    await restaurarRecetas(prisma, redis, foto);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('los dos reciben 200, quedan 2 registros encadenados y vale la tasa del último', async () => {
    const [respuestaA, respuestaB] = await Promise.all([
      primero.pedir('put', '/catalogo/recetas/LIC-02', { tasa: '180.00' }),
      segundo.pedir('put', '/catalogo/recetas/LIC-02', { tasa: '190.00' }),
    ]);

    expect(respuestaA.status).toBe(200);
    expect(respuestaB.status).toBe(200);

    const registros = await prisma.cambio_receta.findMany({
      where: { codigo_receta: 'LIC-02' },
      orderBy: { id: 'asc' },
    });
    expect(registros).toHaveLength(2);
    const [primerCambio, segundoCambio] = registros.map(
      (registro) => registro.cambios as unknown as CambioTasa,
    );
    expect(primerCambio?.tasa.antes).toBe('177.10');
    expect(segundoCambio?.tasa.antes).toBe(primerCambio?.tasa.despues);
    expect(new Set(registros.map((registro) => registro.usuario_id))).toEqual(
      new Set([primero.usuario.id, segundo.usuario.id]),
    );

    const receta = await prisma.receta.findUniqueOrThrow({ where: { codigo: 'LIC-02' } });
    expect(receta.tasa.toFixed(2)).toBe(segundoCambio?.tasa.despues);
  }, 60_000);
});
