import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import {
  type ExpedienteSembrado,
  limpiarTramites,
  sembrarExpediente,
  TITULAR_DE_PRUEBA,
} from '../apoyo/expedientes-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// CU05 de la 004 (FR-028 a FR-033, aclaración 1; contracts/consulta-y-bandeja.md). Datos FICTICIOS.

describe('Consulta pública del estado (CU05 de la 004)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let expediente: ExpedienteSembrado;

  const consultar = (cuerpo: object, origen = '203.0.113.10') =>
    request(app.getHttpServer())
      .post('/api/v1/expedientes/consultar')
      .set('X-Forwarded-For', origen)
      .send(cuerpo);

  const limpiarContadores = async () => {
    const claves = await redis.keys('lim:consulta:*');
    if (claves.length > 0) {
      await redis.del(...claves);
    }
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    await limpiarTramites(prisma);
    expediente = await sembrarExpediente(prisma, app.get<ProtectorDatos>(PROTECTOR_DATOS));
  });

  beforeEach(async () => {
    await limpiarContadores();
  });

  afterAll(async () => {
    await limpiarContadores();
    await limpiarTramites(prisma);
    await app.close();
  });

  it.each([
    ['el DNI', TITULAR_DE_PRUEBA.documento],
    ['el RUC', TITULAR_DE_PRUEBA.ruc],
  ])('con %s responde el estado sin datos personales y sin caché', async (_, documento) => {
    const respuesta = await consultar({ numeroExpediente: expediente.numero, documento });

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('post', '/expedientes/consultar', respuesta);
    expect(respuesta.body).toMatchObject({
      numero: expediente.numero,
      estado: 'REGISTRADO',
      descripcionEstado: 'Tu solicitud fue registrada y espera evaluación',
      ruta: 'A',
      vencePlazoEn: null,
      historial: [{ estado: 'REGISTRADO' }],
    });
    const texto = JSON.stringify(respuesta.body);
    for (const dato of Object.values(TITULAR_DE_PRUEBA).filter((valor) => valor !== 'DNI')) {
      expect(texto).not.toContain(dato);
    }
  });

  it('acepta el número en minúsculas y con espacios', async () => {
    const respuesta = await consultar({
      numeroExpediente: `  ${expediente.numero.toLowerCase()} `,
      documento: TITULAR_DE_PRUEBA.documento,
    });

    expect(respuesta.status).toBe(200);
  });

  it('un documento ajeno y un número inexistente responden el mismo 404', async () => {
    const ajeno = await consultar({ numeroExpediente: expediente.numero, documento: '40000009' });
    const inexistente = await consultar({
      numeroExpediente: 'EXP-2026-999999',
      documento: TITULAR_DE_PRUEBA.documento,
    });

    expect(ajeno.status).toBe(404);
    expect(inexistente.status).toBe(404);
    await esperarCumpleContrato('post', '/expedientes/consultar', ajeno);
    expect(ajeno.body).toEqual(inexistente.body);
  });

  it('el documento del representante no sirve para consultar', async () => {
    const respuesta = await consultar({
      numeroExpediente: expediente.numero,
      documento: '40000002',
    });

    expect(respuesta.status).toBe(404);
  });

  it('un formato inválido responde 422 y no cuenta como intento', async () => {
    for (let intento = 0; intento < 6; intento += 1) {
      const respuesta = await consultar({ numeroExpediente: 'EXP-26-1', documento: '123' });
      expect(respuesta.status).toBe(422);
    }
    await esperarCumpleContrato(
      'post',
      '/expedientes/consultar',
      await consultar({ numeroExpediente: 'X', documento: '40000001' }),
    );

    const correcta = await consultar({
      numeroExpediente: expediente.numero,
      documento: TITULAR_DE_PRUEBA.documento,
    });
    expect(correcta.status).toBe(200);
  });

  it('tras 5 fallos desde el mismo origen, el 6.º intento correcto responde 429 (SC-004)', async () => {
    for (let intento = 0; intento < 5; intento += 1) {
      const fallo = await consultar({ numeroExpediente: expediente.numero, documento: '40000009' });
      expect(fallo.status).toBe(404);
    }

    const sexto = await consultar({
      numeroExpediente: expediente.numero,
      documento: TITULAR_DE_PRUEBA.documento,
    });

    expect(sexto.status).toBe(429);
    await esperarCumpleContrato('post', '/expedientes/consultar', sexto);
    expect(Number(sexto.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('las consultas correctas no suman al contador', async () => {
    for (let intento = 0; intento < 8; intento += 1) {
      const respuesta = await consultar({
        numeroExpediente: expediente.numero,
        documento: TITULAR_DE_PRUEBA.documento,
      });
      expect(respuesta.status).toBe(200);
    }
  });

  it('los fallos desde otro origen sobre el mismo número no bloquean al primero', async () => {
    for (let intento = 0; intento < 6; intento += 1) {
      await consultar(
        { numeroExpediente: expediente.numero, documento: '40000009' },
        '198.51.100.5',
      );
    }

    const primero = await consultar({
      numeroExpediente: expediente.numero,
      documento: TITULAR_DE_PRUEBA.documento,
    });

    expect(primero.status).toBe(200);
  });

  it('si no se pueden contar los intentos responde 503 (falla cerrado)', async () => {
    const original = redis.eval.bind(redis);
    redis.eval = (() =>
      Promise.reject(new Error('Redis no disponible'))) as unknown as Redis['eval'];
    try {
      const respuesta = await consultar({
        numeroExpediente: expediente.numero,
        documento: TITULAR_DE_PRUEBA.documento,
      });
      expect(respuesta.status).toBe(503);
      await esperarCumpleContrato('post', '/expedientes/consultar', respuesta);
    } finally {
      redis.eval = original;
    }
  });
});
