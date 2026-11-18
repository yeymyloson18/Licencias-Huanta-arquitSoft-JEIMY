import { Controller, Get, type INestApplication, UseGuards } from '@nestjs/common';
import type Redis from 'ioredis';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { JwtAuthGuard } from '../../src/modulos/seguridad/fachada';
import { RELOJ } from '../../src/modulos/seguridad/tokens';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { leerOtpSimulado, limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { RelojControlable } from '../apoyo/reloj-prueba';
import { crearUsuarioDePrueba, type UsuarioDePrueba } from '../apoyo/usuarios-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Flujo de contracts/autenticacion.md con PostgreSQL y Redis reales (historia 1).

/** Operación protegida de ejemplo: la gestión de usuarios (que la protegerá de verdad) llega en US5. */
@Controller('prueba')
class ControladorProtegidoDePrueba {
  @Get('protegida')
  @UseGuards(JwtAuthGuard)
  protegida(): { ok: true } {
    return { ok: true };
  }
}

const COOKIE = 'refresh_personal';

const cookieRefresh = (respuesta: Response): string => {
  const cabecera = respuesta.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cabecera?.find((linea) => linea.startsWith(`${COOKIE}=`));
  if (cookie === undefined) {
    throw new Error('La respuesta no trae la cookie refresh_personal');
  }
  return cookie;
};

/** `refresh_personal=<valor>` listo para la cabecera Cookie (supertest no envía cookies Secure por HTTP). */
const valorCookie = (respuesta: Response): string => cookieRefresh(respuesta).split(';')[0] ?? '';

describe('Inicio de sesión del personal (/auth)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;
  const reloj = new RelojControlable();

  const servidor = () => app.getHttpServer();

  const iniciar = (correo: string, clave: string) =>
    request(servidor()).post('/api/v1/auth/iniciar-sesion').send({ correo, clave });

  const verificar = (desafioId: string, codigo: string) =>
    request(servidor()).post('/api/v1/auth/verificar-otp').send({ desafioId, codigo });

  const renovar = (cookie: string) =>
    request(servidor()).post('/api/v1/auth/renovar').set('Cookie', cookie);

  /** Inicia sesión en dos pasos y devuelve la respuesta del paso 2. */
  const entrar = async (usuario: UsuarioDePrueba): Promise<Response> => {
    const paso1 = await iniciar(usuario.correo, usuario.clave).expect(200);
    const codigo = await leerOtpSimulado(redis, usuario.id);
    return verificar((paso1.body as { desafioId: string }).desafioId, codigo).expect(200);
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba({
      controladores: [ControladorProtegidoDePrueba],
      ajustar: (constructor) => constructor.overrideProvider(RELOJ).useValue(reloj),
    })) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
  });

  beforeEach(async () => {
    reloj.reiniciar();
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('inicia sesión en dos pasos: desafío, código y sesión con cookie (FR-001, FR-003)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['CAJA', 'JEFATURA'] });

    const paso1 = await iniciar(usuario.correo, usuario.clave);
    expect(paso1.status).toBe(200);
    expect(paso1.body).toMatchObject({
      celularEnmascarado: expect.stringMatching(/^9\*{5}\d{3}$/),
    });
    await esperarCumpleContrato('post', '/auth/iniciar-sesion', paso1);

    const codigo = await leerOtpSimulado(redis, usuario.id);
    const paso2 = await verificar((paso1.body as { desafioId: string }).desafioId, codigo);
    expect(paso2.status).toBe(200);
    await esperarCumpleContrato('post', '/auth/verificar-otp', paso2);
    expect(paso2.body).not.toHaveProperty('refreshToken');
    expect(paso2.body).toMatchObject({
      expiraEn: 900,
      debeCambiarClave: false,
      usuario: { id: usuario.id, correo: usuario.correo, activo: true, debeCambiarClave: false },
    });
    expect((paso2.body as { usuario: { roles: string[] } }).usuario.roles.sort()).toEqual([
      'CAJA',
      'JEFATURA',
    ]);

    const cookie = cookieRefresh(paso2);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/Max-Age=28[0-9]{3}/);

    const token = (paso2.body as { accessToken: string }).accessToken;
    await request(servidor())
      .get('/api/v1/prueba/protegida')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('responde el mismo 401 para correo inexistente, clave incorrecta, usuario inactivo y código incorrecto (FR-005)', async () => {
    const activo = await crearUsuarioDePrueba(prisma);
    const inactivo = await crearUsuarioDePrueba(prisma, { activo: false });

    const respuestas = [
      await iniciar('nadie.registrado@ejemplo.pe', 'ClaveCualquiera2026'),
      await iniciar(activo.correo, 'ClaveIncorrecta2026'),
      await iniciar(inactivo.correo, inactivo.clave),
    ];
    const paso1 = await iniciar(activo.correo, activo.clave).expect(200);
    respuestas.push(await verificar((paso1.body as { desafioId: string }).desafioId, '000000'));

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(401);
      expect(respuesta.body).toEqual(respuestas[0]?.body);
    }
    await esperarCumpleContrato('post', '/auth/iniciar-sesion', respuestas[0] as Response);
    await esperarCumpleContrato('post', '/auth/verificar-otp', respuestas[3] as Response);
    expect(JSON.stringify(respuestas.map((r) => r.body as unknown))).not.toContain(activo.correo);
  });

  it('rechaza un código vencido y un código ya usado (FR-002)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);

    const paso1 = await iniciar(usuario.correo, usuario.clave).expect(200);
    const codigo = await leerOtpSimulado(redis, usuario.id);
    reloj.avanzar(301);
    await verificar((paso1.body as { desafioId: string }).desafioId, codigo).expect(401);

    reloj.reiniciar();
    const otro = await iniciar(usuario.correo, usuario.clave).expect(200);
    const desafio = (otro.body as { desafioId: string }).desafioId;
    const nuevoCodigo = await leerOtpSimulado(redis, usuario.id);
    await verificar(desafio, nuevoCodigo).expect(200);
    await verificar(desafio, nuevoCodigo).expect(401);
  });

  it('valida el cuerpo según el contrato (422 sin repetir los valores)', async () => {
    const respuesta = await iniciar('no-es-un-correo', '');

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('post', '/auth/iniciar-sesion', respuesta);
    expect(JSON.stringify(respuesta.body)).not.toContain('no-es-un-correo');
  });

  it('renovar rota la cookie; reutilizar la anterior pasados 10 s cierra todas las sesiones', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const cookieInicial = valorCookie(await entrar(usuario));

    const renovada = await renovar(cookieInicial);
    expect(renovada.status).toBe(200);
    await esperarCumpleContrato('post', '/auth/renovar', renovada);
    const cookieNueva = valorCookie(renovada);
    expect(cookieNueva).not.toBe(cookieInicial);

    reloj.avanzar(11);
    await renovar(cookieInicial).expect(401);
    await renovar(cookieNueva).expect(401);
  });

  it('cerrar sesión responde 204, borra la cookie y la sesión ya no se renueva (FR-004)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const cookie = valorCookie(await entrar(usuario));

    const cierre = await request(servidor())
      .post('/api/v1/auth/cerrar-sesion')
      .set('Cookie', cookie);
    expect(cierre.status).toBe(204);
    expect(cookieRefresh(cierre)).toMatch(/(Max-Age=0|Expires=Thu, 01 Jan 1970)/);

    await renovar(cookie).expect(401);
    await request(servidor()).post('/api/v1/auth/cerrar-sesion').expect(204);
  });

  it('con más de 30 minutos desde la última renovación no renueva (FR-003a)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const cookie = valorCookie(await entrar(usuario));

    reloj.avanzar(30 * 60 + 1);

    await renovar(cookie).expect(401);
  });

  it('con clave temporal solo permite cambiarla; después funciona con normalidad (FR-022)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { debeCambiarClave: true });
    const paso2 = await entrar(usuario);
    expect(paso2.body).toMatchObject({ debeCambiarClave: true });
    const token = (paso2.body as { accessToken: string }).accessToken;

    const bloqueada = await request(servidor())
      .get('/api/v1/prueba/protegida')
      .set('Authorization', `Bearer ${token}`);
    expect(bloqueada.status).toBe(403);
    expect(bloqueada.body).toMatchObject({
      type: 'https://licencias.example.pe/errores/debe-cambiar-clave',
    });

    const debil = await request(servidor())
      .post('/api/v1/auth/cambiar-clave')
      .set('Authorization', `Bearer ${token}`)
      .send({ claveActual: usuario.clave, claveNueva: 'corta' });
    expect(debil.status).toBe(422);
    await esperarCumpleContrato('post', '/auth/cambiar-clave', debil);

    const cambio = await request(servidor())
      .post('/api/v1/auth/cambiar-clave')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', valorCookie(paso2))
      .send({ claveActual: usuario.clave, claveNueva: 'ClaveDefinitiva2026' });
    expect(cambio.status).toBe(200);
    await esperarCumpleContrato('post', '/auth/cambiar-clave', cambio);
    expect(cambio.body).toMatchObject({ debeCambiarClave: false });
    cookieRefresh(cambio);

    const nuevoToken = (cambio.body as { accessToken: string }).accessToken;
    await request(servidor())
      .get('/api/v1/prueba/protegida')
      .set('Authorization', `Bearer ${nuevoToken}`)
      .expect(200);
  });

  it('cambiar la clave con la clave actual incorrecta responde 401', async () => {
    const usuario = await crearUsuarioDePrueba(prisma, { debeCambiarClave: true });
    const token = ((await entrar(usuario)).body as { accessToken: string }).accessToken;

    const respuesta = await request(servidor())
      .post('/api/v1/auth/cambiar-clave')
      .set('Authorization', `Bearer ${token}`)
      .send({ claveActual: 'NoEsLaClave2026', claveNueva: 'ClaveDefinitiva2026' });

    expect(respuesta.status).toBe(401);
    await esperarCumpleContrato('post', '/auth/cambiar-clave', respuesta);
  });
});
