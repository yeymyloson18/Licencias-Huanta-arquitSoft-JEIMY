import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { iniciarSesionDePrueba } from '../apoyo/sesion-prueba';
import { crearUsuarioDePrueba } from '../apoyo/usuarios-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Mi perfil (011, HU2): GET /perfil devuelve solo los datos de quien tiene la sesión.

interface PerfilApi {
  readonly nombreCompleto: string;
  readonly correo: string;
  readonly celularEnmascarado: string;
  readonly roles: string[];
  readonly ultimoIngreso: string | null;
  readonly sesionesAbiertas: number;
}

describe('GET /perfil (011, HU2)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;

  const pedirPerfil = async (token: string) => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/v1/perfil')
      .set('Authorization', `Bearer ${token}`);
    return respuesta;
  };

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

  it('responde 200 con los datos propios, según el contrato y con Cache-Control no-store', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['MESA_PARTES', 'CAJA'] });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);

    const respuesta = await pedirPerfil(accessToken);

    expect(respuesta.status).toBe(200);
    await esperarCumpleContrato('get', '/perfil', respuesta);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    const perfil = respuesta.body as PerfilApi;
    expect(perfil.correo).toBe(usuario.correo);
    expect(perfil.nombreCompleto).toBe(usuario.nombre);
    expect([...perfil.roles].sort()).toEqual(['CAJA', 'MESA_PARTES']);
    expect(perfil.celularEnmascarado).toMatch(/^\d\*{5}\d{3}$/);
    expect(perfil.celularEnmascarado).toBe(
      `${usuario.celular.slice(0, 1)}*****${usuario.celular.slice(-3)}`,
    );
    expect(perfil.ultimoIngreso).not.toBeNull();
    expect(perfil.sesionesAbiertas).toBe(1);
  });

  it('dos ingresos del mismo usuario cuentan 2 sesiones abiertas', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['INSPECTOR'] });
    await iniciarSesionDePrueba(app, redis, usuario);
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);

    const respuesta = await pedirPerfil(accessToken);

    expect(respuesta.status).toBe(200);
    expect((respuesta.body as PerfilApi).sesionesAbiertas).toBe(2);
  });

  it('ignora un id ajeno en la consulta o en una cabecera: siempre el perfil propio (HU4)', async () => {
    const a = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
    const b = await crearUsuarioDePrueba(prisma, { roles: ['ADMINISTRADOR'] });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, a);
    const conToken = (ruta: string) =>
      request(app.getHttpServer()).get(ruta).set('Authorization', `Bearer ${accessToken}`);

    // Sin cuerpo: un GET no lleva cuerpo.
    const respuestas = [
      await conToken(`/api/v1/perfil?usuarioId=${b.id}`),
      await conToken(`/api/v1/perfil?id=${b.id}`),
      await conToken('/api/v1/perfil').set('X-Usuario-Id', b.id),
    ];

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(200);
      expect((respuesta.body as PerfilApi).correo).toBe(a.correo);
      expect(respuesta.text).not.toContain(b.correo);
      expect(respuesta.text).not.toContain(b.nombre);
    }
  });

  it('nunca incluye el id, la huella de la clave ni el celular completo', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['JEFATURA'] });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);

    const respuesta = await pedirPerfil(accessToken);

    expect(Object.keys(respuesta.body as object).sort()).toEqual([
      'celularEnmascarado',
      'correo',
      'nombreCompleto',
      'roles',
      'sesionesAbiertas',
      'ultimoIngreso',
    ]);
    const texto = JSON.stringify(respuesta.body);
    expect(texto).not.toContain(usuario.id);
    expect(texto).not.toContain(usuario.celular);
    expect(texto).not.toContain(usuario.clave);
  });
});
