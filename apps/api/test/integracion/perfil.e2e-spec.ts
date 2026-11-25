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

  describe('cambio de clave voluntario desde Mi perfil (011, HU3)', () => {
    const claveNueva = 'ClaveVoluntariaSegura2026';
    const cambiar = (token: string, claveActual: string, nueva: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/cambiar-clave')
        .set('Authorization', `Bearer ${token}`)
        .send({ claveActual, claveNueva: nueva });

    it('cambia la clave, cierra la otra sesión y queda "Clave cambiada" con actor = afectado', async () => {
      const administrador = await crearUsuarioDePrueba(prisma, { roles: ['ADMINISTRADOR'] });
      const usuario = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
      const otra = await iniciarSesionDePrueba(app, redis, usuario);
      const actual = await iniciarSesionDePrueba(app, redis, usuario);
      expect(((await pedirPerfil(actual.accessToken)).body as PerfilApi).sesionesAbiertas).toBe(2);

      const cambio = await cambiar(actual.accessToken, usuario.clave, claveNueva);
      expect(cambio.status).toBe(200);
      const tokenNuevo = (cambio.body as { accessToken: string }).accessToken;

      // La otra sesión se cerró; la actual sigue con su token nuevo y ve 1 sesión abierta.
      expect((await pedirPerfil(otra.accessToken)).status).toBe(401);
      const perfil = await pedirPerfil(tokenNuevo);
      expect(perfil.status).toBe(200);
      expect((perfil.body as PerfilApi).sesionesAbiertas).toBe(1);

      // La clave anterior ya no sirve; la nueva sí.
      await request(app.getHttpServer())
        .post('/api/v1/auth/iniciar-sesion')
        .send({ correo: usuario.correo, clave: usuario.clave })
        .expect(401);
      await iniciarSesionDePrueba(app, redis, { ...usuario, clave: claveNueva });

      const { accessToken: tokenAdmin } = await iniciarSesionDePrueba(app, redis, administrador);
      const auditoria = await request(app.getHttpServer())
        .get(`/api/v1/admin/auditoria?accion=CLAVE_CAMBIADA&afectadoId=${usuario.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);
      const eventos = (
        auditoria.body as {
          datos: { actor: { id: string } | null; afectado: { id: string } | null }[];
        }
      ).datos;
      expect(eventos).toHaveLength(1);
      expect(eventos[0]?.actor?.id).toBe(usuario.id);
      expect(eventos[0]?.afectado?.id).toBe(usuario.id);
    });

    it.each([
      ['igual a la actual', null],
      ['de menos de 12 caracteres', 'Corta123'],
      ['sin números', 'SoloLetrasMuyLargas'],
    ])('rechaza con 422 una clave nueva %s', async (_caso, nueva) => {
      const usuario = await crearUsuarioDePrueba(prisma, { roles: ['EVALUADOR'] });
      const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);

      const respuesta = await cambiar(accessToken, usuario.clave, nueva ?? usuario.clave);

      expect(respuesta.status).toBe(422);
      // La clave no cambió: sigue sirviendo para ingresar.
      await iniciarSesionDePrueba(app, redis, usuario);
    });

    it('una clave actual incorrecta cuenta para el límite: al pasarlo responde 429', async () => {
      const usuario = await crearUsuarioDePrueba(prisma, { roles: ['JEFATURA'] });
      const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);

      const estados: number[] = [];
      for (let intento = 0; intento < 6; intento += 1) {
        estados.push(
          (await cambiar(accessToken, `ClaveErrada${String(intento)}2026`, claveNueva)).status,
        );
      }

      expect(estados.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(estados[5]).toBe(429);
    });
  });
});
