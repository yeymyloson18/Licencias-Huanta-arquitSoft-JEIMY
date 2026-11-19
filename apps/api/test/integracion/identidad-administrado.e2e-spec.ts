import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import {
  confirmarIdentidad,
  DNI_SERVICIO_CAIDO,
  REPRESENTANTE_PRUEBA,
  TITULAR_PRUEBA_1,
  verificarIdentidad,
} from '../apoyo/identidad-prueba';
import { leerOtpSimulado, limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// CU03 de la 004 (FR-001 a FR-007, contracts/identidad-y-solicitud.md), con el servicio de
// identificación simulado y datos FICTICIOS.

describe('Identidad del administrado en línea (CU03 de la 004)', () => {
  let app: INestApplication<App>;
  let redis: Redis;

  const verificarCodigo = (desafioId: string, codigo: string) =>
    request(app.getHttpServer())
      .post('/api/v1/identidad/verificar-otp')
      .send({ desafioId, codigo });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
  });

  beforeEach(async () => {
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('con datos que coinciden envía el código y responde el desafío con el celular enmascarado', async () => {
    const respuesta = await verificarIdentidad(app, TITULAR_PRUEBA_1);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('post', '/identidad/verificar', respuesta);
    expect(respuesta.body).toMatchObject({ celularEnmascarado: '9*****001' });
    const desafioId = (respuesta.body as { desafioId: string }).desafioId;
    expect(await leerOtpSimulado(redis, desafioId)).toMatch(/^[0-9]{6}$/);
  });

  it('con datos que no coinciden responde 422 sin decir qué dato falló y sin enviar código', async () => {
    const respuesta = await verificarIdentidad(app, {
      ...TITULAR_PRUEBA_1,
      fechaEmision: '2020-01-16',
    });

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('post', '/identidad/verificar', respuesta);
    expect((respuesta.body as { errores: { campo: string }[] }).errores).toEqual([
      { campo: 'identidad', mensaje: 'Los datos no coinciden con el servicio de identificación' },
    ]);
    expect(JSON.stringify(respuesta.body)).not.toMatch(/40000001|10400000011|987000001/);
    expect(await redis.keys('dev:otp:*')).toEqual([]);
  });

  it('con un representante que no coincide responde 422', async () => {
    const respuesta = await verificarIdentidad(app, {
      ...TITULAR_PRUEBA_1,
      representante: { ...REPRESENTANTE_PRUEBA, numeroDocumento: '40000003' },
    });

    expect(respuesta.status).toBe(422);
  });

  it('con un representante que coincide envía el código', async () => {
    const respuesta = await verificarIdentidad(app, {
      ...TITULAR_PRUEBA_1,
      representante: REPRESENTANTE_PRUEBA,
    });

    expect(respuesta.status).toBe(200);
  });

  it('si el servicio de identificación no responde, 503 sugiere mesa de partes', async () => {
    const respuesta = await verificarIdentidad(app, {
      ...TITULAR_PRUEBA_1,
      numeroDocumento: DNI_SERVICIO_CAIDO,
    });

    expect(respuesta.status).toBe(503);
    await esperarCumpleContrato('post', '/identidad/verificar', respuesta);
    expect((respuesta.body as { title: string }).title).toMatch(/mesa de partes/);
  });

  it('un formato inválido responde 422 por campo sin repetir el valor', async () => {
    const respuesta = await verificarIdentidad(app, { ...TITULAR_PRUEBA_1, celular: '12345' });

    expect(respuesta.status).toBe(422);
    expect((respuesta.body as { errores: { campo: string }[] }).errores[0]?.campo).toBe('celular');
    expect(JSON.stringify(respuesta.body)).not.toContain('12345');
  });

  it('con el código correcto entrega el token de 15 minutos; con uno incorrecto, 401', async () => {
    const paso1 = await verificarIdentidad(app, TITULAR_PRUEBA_1).expect(200);
    const desafioId = (paso1.body as { desafioId: string }).desafioId;

    const incorrecto = await verificarCodigo(desafioId, '000000');
    expect(incorrecto.status).toBe(401);
    await esperarCumpleContrato('post', '/identidad/verificar-otp', incorrecto);

    const codigo = await leerOtpSimulado(redis, desafioId);
    const correcto = await verificarCodigo(desafioId, codigo);
    expect(correcto.status).toBe(200);
    expect(correcto.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('post', '/identidad/verificar-otp', correcto);
    expect(correcto.body).toMatchObject({ expiraEn: 900 });
  });

  it('otro código deja sin valor el anterior y el 4.º envío al mismo celular responde 429', async () => {
    const primero = await verificarIdentidad(app, TITULAR_PRUEBA_1).expect(200);
    const desafioViejo = (primero.body as { desafioId: string }).desafioId;
    const codigoViejo = await leerOtpSimulado(redis, desafioViejo);
    await verificarIdentidad(app, TITULAR_PRUEBA_1).expect(200);

    expect((await verificarCodigo(desafioViejo, codigoViejo)).status).toBe(401);

    await verificarIdentidad(app, TITULAR_PRUEBA_1).expect(200);
    const cuarto = await verificarIdentidad(app, TITULAR_PRUEBA_1);
    expect(cuarto.status).toBe(429);
    expect(cuarto.headers['retry-after']).toBeDefined();
  });

  it('el 6.º intento fallido con el mismo documento responde 429 con Retry-After (SC-004)', async () => {
    const fallido = { ...TITULAR_PRUEBA_1, fechaEmision: '2020-01-16' };
    for (let intento = 1; intento <= 5; intento += 1) {
      expect((await verificarIdentidad(app, fallido)).status).toBe(422);
    }

    const sexto = await verificarIdentidad(app, TITULAR_PRUEBA_1);

    expect(sexto.status).toBe(429);
    await esperarCumpleContrato('post', '/identidad/verificar', sexto);
    expect(Number(sexto.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('el token de identidad no sirve como token del personal', async () => {
    const { token } = await confirmarIdentidad(app, redis);

    const respuesta = await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(401);
  });

  it('si no se pueden contar los intentos responde 503 (falla cerrado)', async () => {
    const original = redis.multi.bind(redis);
    redis.multi = (() => {
      throw new Error('Redis no disponible');
    }) as unknown as Redis['multi'];
    try {
      const respuesta = await verificarIdentidad(app, TITULAR_PRUEBA_1);
      expect(respuesta.status).toBe(503);
    } finally {
      redis.multi = original;
    }
  });
});
