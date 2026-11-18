import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import {
  borrarCacheCatalogo,
  fotografiarRecetas,
  restaurarRecetas,
  type FotoRecetas,
} from '../apoyo/catalogo-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 4 de la 003: una receta desactivada desaparece del catálogo público y del asistente
// (FR-013), sigue visible para el administrador (FR-016) y se puede reactivar. El cambio se ve en la
// siguiente consulta, sin esperar al TTL, porque guardar borra la caché (FR-024).

const RESPUESTAS_CESIONARIO_MEDIO = {
  TIPO_ESTABLECIMIENTO: 'OTRO',
  ES_CESIONARIO: 'SI',
  NIVEL_RIESGO: 'MEDIO',
};

describe('Desactivar y reactivar una receta (historia 4 de la 003)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;
  let foto: FotoRecetas;
  let admin: ClienteConSesion;

  const publico = () => request(app.getHttpServer());
  const codigosPublicos = async () =>
    ((await publico().get('/api/v1/catalogo/recetas')).body as { codigo: string }[]).map(
      (receta) => receta.codigo,
    );
  const fichaPublica = () => publico().get('/api/v1/catalogo/recetas/LIC-06');
  const proponer = () =>
    publico().post('/api/v1/asistente/proponer').send({ respuestas: RESPUESTAS_CESIONARIO_MEDIO });
  const cambiarEstado = (activa: boolean) =>
    admin.pedir('put', '/catalogo/recetas/LIC-06', { activa });

  /** Lee todo lo público para dejarlo en la caché antes de guardar. */
  const llenarCache = async () => {
    await codigosPublicos();
    await fichaPublica();
    await proponer();
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    foto = await fotografiarRecetas(prisma, ['LIC-06']);
    await borrarCacheCatalogo(redis);
    admin = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
  });

  afterEach(async () => {
    await restaurarRecetas(prisma, redis, foto);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('al desactivarla desaparece del público y del asistente, pero el administrador la sigue viendo', async () => {
    await llenarCache();
    expect(await codigosPublicos()).toContain('LIC-06');

    const respuesta = await cambiarEstado(false);

    expect(respuesta.status).toBe(200);
    await esperarCumpleContrato('put', '/catalogo/recetas/{codigoReceta}', respuesta);
    expect((respuesta.body as { activa: boolean }).activa).toBe(false);
    const registros = await prisma.cambio_receta.findMany({ where: { codigo_receta: 'LIC-06' } });
    expect(registros.map((registro) => registro.cambios)).toEqual([
      { activa: { antes: true, despues: false } },
    ]);

    // Sin esperar al TTL: la caché se borró al guardar.
    expect(await codigosPublicos()).not.toContain('LIC-06');
    const ficha = await fichaPublica();
    expect(ficha.status).toBe(404);
    expect(ficha.headers['cache-control']).toBe('no-store');
    const propuesta = await proponer();
    expect(propuesta.status).toBe(200);
    expect(propuesta.body).toEqual({
      resultado: 'NO_DETERMINADA',
      motivo: 'RECETA_NO_DISPONIBLE',
    });

    const deAdministracion = await admin.pedir('get', '/admin/catalogo/recetas/LIC-06');
    expect(deAdministracion.status).toBe(200);
    expect((deAdministracion.body as { activa: boolean }).activa).toBe(false);
    const lista = (await admin.pedir('get', '/admin/catalogo/recetas')).body as {
      codigo: string;
      activa: boolean;
    }[];
    expect(lista.find((receta) => receta.codigo === 'LIC-06')?.activa).toBe(false);
  });

  it('al reactivarla todo vuelve y queda un segundo registro', async () => {
    await cambiarEstado(false);
    await llenarCache();

    const respuesta = await cambiarEstado(true);

    expect(respuesta.status).toBe(200);
    expect((respuesta.body as { activa: boolean }).activa).toBe(true);
    const registros = await prisma.cambio_receta.findMany({
      where: { codigo_receta: 'LIC-06' },
      orderBy: { id: 'asc' },
    });
    expect(registros.map((registro) => registro.cambios)).toEqual([
      { activa: { antes: true, despues: false } },
      { activa: { antes: false, despues: true } },
    ]);

    expect(await codigosPublicos()).toContain('LIC-06');
    expect((await fichaPublica()).status).toBe(200);
    expect((await proponer()).body).toMatchObject({
      resultado: 'PROPUESTA',
      receta: { codigo: 'LIC-06' },
    });
  });

  it('desactivar una receta ya desactivada no crea otro registro (FR-022)', async () => {
    await cambiarEstado(false);

    const respuesta = await cambiarEstado(false);

    expect(respuesta.status).toBe(200);
    expect(await prisma.cambio_receta.count({ where: { codigo_receta: 'LIC-06' } })).toBe(1);
  });
});
