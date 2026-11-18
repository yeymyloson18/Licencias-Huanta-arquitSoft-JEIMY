import { Controller, Get, type INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import {
  RequiereRoles,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../../src/modulos/seguridad/fachada';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { iniciarSesionDePrueba, modificarUsuarioDePrueba } from '../apoyo/sesion-prueba';
import { crearUsuarioDePrueba } from '../apoyo/usuarios-prueba';

// Historia 2: control de permisos reutilizable desde la fachada (contracts/control-permisos.md).
// El controlador de prueba importa SOLO la fachada, como lo hará cualquier otro módulo.

@Controller('prueba')
class ControladorDeOtroModulo {
  @Get('caja')
  @RequiereRoles('CAJA')
  caja(@UsuarioActual() usuario: UsuarioAutenticado): UsuarioAutenticado {
    return usuario;
  }

  @Get('jefatura')
  @RequiereRoles('JEFATURA')
  jefatura(): { ok: true } {
    return { ok: true };
  }
}

describe('Control de permisos por rol (historia 2, EQ-04)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;

  const pedir = (ruta: string, token?: string) => {
    const peticion = request(app.getHttpServer()).get(`/api/v1/prueba/${ruta}`);
    return token === undefined ? peticion : peticion.set('Authorization', `Bearer ${token}`);
  };

  const tipo = (cuerpo: unknown) => (cuerpo as { type?: string }).type?.split('/').pop();

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba({ controladores: [ControladorDeOtroModulo] })) as {
      app: INestApplication<App>;
    });
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

  it('sin token o con un token alterado responde 401 no-autenticado (FR-013)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);

    const sinToken = await pedir('caja');
    const alterado = await pedir('caja', `${accessToken.slice(0, -4)}AAAA`);

    for (const respuesta of [sinToken, alterado]) {
      expect(respuesta.status).toBe(401);
      expect(tipo(respuesta.body)).toBe('no-autenticado');
    }
  });

  it('el token de una sesión cerrada responde 401 aunque no haya vencido (FR-004)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
    const { accessToken, cookie } = await iniciarSesionDePrueba(app, redis, usuario);
    await pedir('caja', accessToken).expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/cerrar-sesion')
      .set('Cookie', cookie)
      .expect(204);

    await pedir('caja', accessToken).expect(401);
  });

  it('con un rol insuficiente responde 403 sin-permiso; con el rol correcto, 200', async () => {
    const evaluador = await crearUsuarioDePrueba(prisma, { roles: ['EVALUADOR'] });
    const caja = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });

    const prohibida = await pedir(
      'caja',
      (await iniciarSesionDePrueba(app, redis, evaluador)).accessToken,
    );
    expect(prohibida.status).toBe(403);
    expect(tipo(prohibida.body)).toBe('sin-permiso');

    const permitida = await pedir(
      'caja',
      (await iniciarSesionDePrueba(app, redis, caja)).accessToken,
    );
    expect(permitida.status).toBe(200);
    expect(permitida.body).toEqual({ usuarioId: caja.id, roles: ['CAJA'] });
  });

  it('con varios roles basta con uno admitido (FR-014)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['EVALUADOR', 'JEFATURA'] });

    await pedir('jefatura', (await iniciarSesionDePrueba(app, redis, usuario)).accessToken).expect(
      200,
    );
  });

  it('desactivar al usuario invalida su token desde la siguiente petición (FR-011)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);
    await pedir('caja', accessToken).expect(200);

    await modificarUsuarioDePrueba(prisma, redis, usuario.id, { desactivar: true });

    await pedir('caja', accessToken).expect(401);
  });

  it('quitarle un rol responde 403 en la siguiente petición, sin volver a iniciar sesión (FR-015)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['CAJA', 'JEFATURA'] });
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);
    await pedir('caja', accessToken).expect(200);

    await modificarUsuarioDePrueba(prisma, redis, usuario.id, { retirarRol: 'CAJA' });

    const respuesta = await pedir('caja', accessToken);
    expect(respuesta.status).toBe(403);
    expect(tipo(respuesta.body)).toBe('sin-permiso');
    await pedir('jefatura', accessToken).expect(200);
  });

  it('las sesiones revocadas al cambiar la clave quedan marcadas en Redis (T050)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'], debeCambiarClave: true });
    const otra = await iniciarSesionDePrueba(app, redis, usuario);
    const actual = await iniciarSesionDePrueba(app, redis, usuario);
    const sidOtra = (
      JSON.parse(Buffer.from(otra.accessToken.split('.')[1] ?? '', 'base64url').toString()) as {
        sid: string;
      }
    ).sid;

    await request(app.getHttpServer())
      .post('/api/v1/auth/cambiar-clave')
      .set('Authorization', `Bearer ${actual.accessToken}`)
      .send({ claveActual: usuario.clave, claveNueva: 'ClaveDefinitiva2026' })
      .expect(200);

    await expect(redis.get(`seg:sesion-revocada:${sidOtra}`)).resolves.toBe('1');
    await expect(redis.get(`seg:version:${usuario.id}`)).resolves.not.toBeNull();
    await pedir('caja', otra.accessToken).expect(401);
  });

  it('con Redis desconectado el control sigue funcionando con PostgreSQL', async () => {
    const caja = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
    const desactivado = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
    const tokenCaja = (await iniciarSesionDePrueba(app, redis, caja)).accessToken;
    const tokenDesactivado = (await iniciarSesionDePrueba(app, redis, desactivado)).accessToken;
    await prisma.usuario.update({
      where: { id: desactivado.id },
      data: { activo: false, version_seguridad: { increment: 1 } },
    });

    redis.disconnect();
    try {
      await pedir('caja', tokenCaja).expect(200);
      await pedir('caja', tokenDesactivado).expect(401);
    } finally {
      await redis.connect();
    }
  });
});
