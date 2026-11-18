import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { HasherClavesArgon2 } from '../../src/modulos/seguridad/infraestructura/hasher-claves-argon2';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { leerOtpSimulado, limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { crearUsuarioDePrueba } from '../apoyo/usuarios-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 4 (FR-002a, FR-006 a FR-009; EQ-04: bloqueo en el 6.º intento).
// La IP de origen se simula con X-Forwarded-For (trust proxy = 1, como detrás del nginx del portal).

describe('Bloqueo ante intentos fallidos (historia 4)', () => {
  let instanciaA: INestApplication<App>;
  let instanciaB: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;

  const iniciar = (
    app: INestApplication<App>,
    correo: string,
    clave: string,
    ip = '203.0.113.10',
  ) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/iniciar-sesion')
      .set('X-Forwarded-For', ip)
      .send({ correo, clave });

  const verificar = (desafioId: string, codigo: string, ip = '203.0.113.10') =>
    request(instanciaA.getHttpServer())
      .post('/api/v1/auth/verificar-otp')
      .set('X-Forwarded-For', ip)
      .send({ desafioId, codigo });

  const esperarBloqueo = async (respuesta: Response) => {
    expect(respuesta.status).toBe(429);
    const segundos = Number(respuesta.headers['retry-after']);
    expect(segundos).toBeGreaterThanOrEqual(1);
    expect(segundos).toBeLessThanOrEqual(900);
    expect(respuesta.body).toMatchObject({
      type: 'https://licencias.example.pe/errores/demasiados-intentos',
    });
    await esperarCumpleContrato('post', '/auth/iniciar-sesion', respuesta);
  };

  beforeAll(async () => {
    ({ app: instanciaA } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    ({ app: instanciaB } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = instanciaA.get(PrismaServicio);
    redis = instanciaA.get<Redis>(REDIS_CLIENTE);
  });

  beforeEach(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await instanciaB.close();
    await instanciaA.close();
  });

  it('5 claves incorrectas → 401; el 6.º intento, aunque sea correcto → 429 con Retry-After', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);

    for (let i = 0; i < 5; i += 1) {
      await iniciar(instanciaA, usuario.correo, 'ClaveIncorrecta2026').expect(401);
    }

    await esperarBloqueo(await iniciar(instanciaA, usuario.correo, 'ClaveIncorrecta2026'));
    await esperarBloqueo(await iniciar(instanciaA, usuario.correo, usuario.clave));
  });

  it('un correo inexistente recibe exactamente las mismas respuestas (FR-008)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const existentes: Response[] = [];
    const inexistentes: Response[] = [];

    for (let i = 0; i < 6; i += 1) {
      existentes.push(await iniciar(instanciaA, usuario.correo, 'Incorrecta2026', '198.51.100.1'));
      inexistentes.push(
        await iniciar(instanciaA, 'nadie.existe@ejemplo.pe', 'Incorrecta2026', '198.51.100.2'),
      );
    }

    expect(inexistentes.map((r) => r.status)).toEqual(existentes.map((r) => r.status));
    expect(inexistentes.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 429]);
    expect(inexistentes[0]?.body).toEqual(existentes[0]?.body);
    expect(inexistentes[5]?.body).toEqual(existentes[5]?.body);
  });

  it('5 fallos contra correos distintos desde la misma IP bloquean esa IP (FR-007)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    for (let i = 0; i < 5; i += 1) {
      await iniciar(
        instanciaA,
        `otro${String(i)}@ejemplo.pe`,
        'Incorrecta2026',
        '192.0.2.50',
      ).expect(401);
    }

    await esperarBloqueo(await iniciar(instanciaA, usuario.correo, usuario.clave, '192.0.2.50'));
    await iniciar(instanciaA, usuario.correo, usuario.clave, '192.0.2.51').expect(200);
  });

  it('los fallos del código OTP suman al mismo contador que los de la clave', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    await iniciar(instanciaA, usuario.correo, 'Incorrecta2026').expect(401);
    await iniciar(instanciaA, usuario.correo, 'Incorrecta2026').expect(401);
    const paso1 = await iniciar(instanciaA, usuario.correo, usuario.clave).expect(200);
    const desafio = (paso1.body as { desafioId: string }).desafioId;
    for (let i = 0; i < 3; i += 1) {
      await verificar(desafio, '000000').expect(401);
    }

    await esperarBloqueo(await iniciar(instanciaA, usuario.correo, usuario.clave));
    const codigo = await leerOtpSimulado(redis, usuario.id);
    const respuesta = await verificar(desafio, codigo);
    expect(respuesta.status).toBe(429);
    await esperarCumpleContrato('post', '/auth/verificar-otp', respuesta);
  });

  it('el 4.º pedido de código en 15 minutos responde 429 (FR-002a)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    for (let i = 0; i < 3; i += 1) {
      await iniciar(instanciaA, usuario.correo, usuario.clave).expect(200);
    }

    await esperarBloqueo(await iniciar(instanciaA, usuario.correo, usuario.clave));
  });

  it('repartir los intentos entre dos instancias no evita el bloqueo (FR-009)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    for (let i = 0; i < 5; i += 1) {
      const instancia = i % 2 === 0 ? instanciaA : instanciaB;
      await iniciar(instancia, usuario.correo, 'Incorrecta2026').expect(401);
    }

    await esperarBloqueo(await iniciar(instanciaB, usuario.correo, usuario.clave));
    await esperarBloqueo(await iniciar(instanciaA, usuario.correo, usuario.clave));
  });

  it('con 20 intentos en paralelo, como máximo 5 llegan a verificar la clave (reserva atómica)', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    const verificaciones = jest.spyOn(HasherClavesArgon2.prototype, 'verificar');

    try {
      const respuestas = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          iniciar(i % 2 === 0 ? instanciaA : instanciaB, usuario.correo, 'ClaveIncorrecta2026'),
        ),
      );

      expect(verificaciones.mock.calls.length).toBeLessThanOrEqual(5);
      const estados = respuestas.map((r) => r.status);
      expect(estados.filter((estado) => estado === 401)).toHaveLength(
        verificaciones.mock.calls.length,
      );
      expect(estados.filter((estado) => estado === 429).length).toBeGreaterThanOrEqual(15);
      expect(estados.every((estado) => estado === 401 || estado === 429)).toBe(true);
    } finally {
      verificaciones.mockRestore();
    }

    // Y el bloqueo sigue: ni siquiera la clave correcta pasa.
    await esperarBloqueo(await iniciar(instanciaA, usuario.correo, usuario.clave));
  });

  it('al vencer el bloqueo se puede entrar con normalidad', async () => {
    const usuario = await crearUsuarioDePrueba(prisma);
    for (let i = 0; i < 5; i += 1) {
      await iniciar(instanciaA, usuario.correo, 'Incorrecta2026').expect(401);
    }
    await esperarBloqueo(await iniciar(instanciaA, usuario.correo, usuario.clave));

    // Simula el fin de la ventana de 15 minutos borrando los contadores.
    await limpiarClavesSeguridad(redis);

    await iniciar(instanciaA, usuario.correo, usuario.clave).expect(200);
  });
});
