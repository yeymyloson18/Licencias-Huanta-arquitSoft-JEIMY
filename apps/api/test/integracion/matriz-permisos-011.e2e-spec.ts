import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import type { Rol } from '../../src/modulos/seguridad/dominio/rol';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { iniciarSesionDePrueba, modificarUsuarioDePrueba } from '../apoyo/sesion-prueba';
import { crearUsuarioDePrueba } from '../apoyo/usuarios-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Matriz de permisos de la 011 (HU4, FR-004 a FR-006, EQ-04): GET /perfil sirve a cualquier usuario
// del personal y SIEMPRE devuelve el perfil de la sesión, nunca el de otra persona.

const ROLES: readonly Rol[] = [
  'MESA_PARTES',
  'EVALUADOR',
  'INSPECTOR',
  'CAJA',
  'JEFATURA',
  'ADMINISTRADOR',
];

interface PerfilApi {
  readonly correo: string;
  readonly nombreCompleto: string;
  readonly roles: string[];
}

describe('Matriz de permisos de Mi perfil (011)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;

  const perfil = (token?: string, ruta = '/api/v1/perfil') => {
    const peticion = request(app.getHttpServer()).get(ruta);
    return token === undefined ? peticion : peticion.set('Authorization', `Bearer ${token}`);
  };

  const tipo = (cuerpo: unknown) => (cuerpo as { type?: string }).type?.split('/').pop();

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

  it('sin token o con un token alterado responde 401 no-autenticado', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);

    const sinToken = await perfil();
    const alterado = await perfil(`${accessToken.slice(0, -4)}AAAA`);

    for (const respuesta of [sinToken, alterado]) {
      expect(respuesta.status).toBe(401);
      expect(tipo(respuesta.body)).toBe('no-autenticado');
      await esperarCumpleContrato('get', '/perfil', respuesta);
    }
  });

  it('con clave temporal responde 403 debe-cambiar-clave', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'], debeCambiarClave: true });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);

    const respuesta = await perfil(accessToken);

    expect(respuesta.status).toBe(403);
    expect(tipo(respuesta.body)).toBe('debe-cambiar-clave');
    await esperarCumpleContrato('get', '/perfil', respuesta);
  });

  it.each(ROLES)('con el rol %s responde 200 con SU perfil', async (rol) => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: [rol] });
    await crearUsuarioDePrueba(prisma, { roles: [rol] });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);

    const respuesta = await perfil(accessToken);

    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as PerfilApi;
    expect(cuerpo.correo).toBe(usuario.correo);
    expect(cuerpo.roles).toEqual([rol]);
  });

  it('un id ajeno en la consulta se ignora; /perfil/<id> no existe y no muestra datos', async () => {
    const a = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
    const b = await crearUsuarioDePrueba(prisma, { roles: ['ADMINISTRADOR'] });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, a);

    const conConsulta = await perfil(accessToken, `/api/v1/perfil?usuarioId=${b.id}`);
    expect(conConsulta.status).toBe(200);
    expect((conConsulta.body as PerfilApi).correo).toBe(a.correo);

    const conRuta = await perfil(accessToken, `/api/v1/perfil/${b.id}`);
    expect(conRuta.status).toBe(404);
    for (const respuesta of [conConsulta, conRuta]) {
      expect(respuesta.text).not.toContain(b.correo);
      expect(respuesta.text).not.toContain(b.nombre);
    }
  });

  it('después de cerrar la sesión responde 401', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['INSPECTOR'] });
    const { accessToken, cookie } = await iniciarSesionDePrueba(app, redis, usuario);
    await perfil(accessToken).expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/cerrar-sesion')
      .set('Cookie', cookie)
      .expect(204);

    const respuesta = await perfil(accessToken);
    expect(respuesta.status).toBe(401);
    expect(tipo(respuesta.body)).toBe('no-autenticado');
  });

  it('después de que el administrador lo desactiva responde 401', async () => {
    const administrador = await crearUsuarioDePrueba(prisma, { roles: ['ADMINISTRADOR'] });
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['EVALUADOR'] });
    const { accessToken: tokenAdmin } = await iniciarSesionDePrueba(app, redis, administrador);
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);
    await perfil(accessToken).expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ activo: false })
      .expect(200);

    const respuesta = await perfil(accessToken);
    expect(respuesta.status).toBe(401);
    expect(tipo(respuesta.body)).toBe('no-autenticado');
  });

  it('sin roles (preparado en la base) responde 200 con roles vacíos (FR-006)', async () => {
    // La API no deja a nadie sin roles (minItems: 1): se retiran en la base y se publica la versión
    // de seguridad nueva, como haría la gestión de usuarios.
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);
    await modificarUsuarioDePrueba(prisma, redis, usuario.id, { retirarRol: 'CAJA' });

    const respuesta = await perfil(accessToken);

    expect(respuesta.status).toBe(200);
    await esperarCumpleContrato('get', '/perfil', respuesta);
    expect((respuesta.body as PerfilApi).roles).toEqual([]);
    expect((respuesta.body as PerfilApi).correo).toBe(usuario.correo);
  });
});
