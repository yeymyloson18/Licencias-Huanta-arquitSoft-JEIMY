import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarTramites } from '../apoyo/expedientes-prueba';
import { confirmarIdentidad, subirPdf, TITULAR_PRUEBA_1 } from '../apoyo/identidad-prueba';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// FR-020 y SC-007 de la 004: la misma solicitud enviada muchas veces a la vez (doble clic,
// reconexión) crea un solo expediente, y todas las respuestas traen el mismo número.

describe('Idempotencia de la presentación (SC-007 de la 004)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
  });

  beforeEach(async () => {
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  const preparar = async () => {
    const { token } = await confirmarIdentidad(app, redis);
    const ficha = await request(app.getHttpServer()).get('/api/v1/catalogo/recetas/LIC-02');
    const requisitos = (ficha.body as { requisitos: { id: number; condicion: string }[] })
      .requisitos;
    const documentos = [];
    for (const requisito of requisitos.filter((r) => r.condicion === 'SIEMPRE')) {
      documentos.push({ requisitoId: requisito.id, documentoId: await subirPdf(app, token) });
    }
    const cuerpo = {
      codigoReceta: 'LIC-02',
      identidad: TITULAR_PRUEBA_1,
      nombreTitular: 'Titular de Prueba Uno',
      giro: 'Bodega',
      direccion: 'Jr. Ficticio 123',
      zona: 'Centro',
      areaM2: 40,
      documentos,
    };
    const enviar = (clave: string, datos: object = cuerpo) =>
      request(app.getHttpServer())
        .post('/api/v1/expedientes')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', clave)
        .send(datos);
    return { cuerpo, enviar };
  };

  it('10 envíos en paralelo con la misma clave crean un solo expediente con el mismo número', async () => {
    const { enviar } = await preparar();
    const clave = randomUUID();

    const respuestas = await Promise.all(Array.from({ length: 10 }, () => enviar(clave)));

    const estados = respuestas.map((respuesta) => respuesta.status);
    expect(estados.filter((estado) => estado === 201)).toHaveLength(1);
    expect(estados.every((estado) => estado === 201 || estado === 200)).toBe(true);
    const numeros = new Set(respuestas.map((r) => (r.body as { numero: string }).numero));
    expect(numeros.size).toBe(1);
    expect(await prisma.expediente.count()).toBe(1);
  }, 60_000);

  it('la misma clave con otro cuerpo responde 422', async () => {
    const { cuerpo, enviar } = await preparar();
    const clave = randomUUID();
    await enviar(clave).expect(201);

    const respuesta = await enviar(clave, { ...cuerpo, giro: 'Otro giro' });

    expect(respuesta.status).toBe(422);
    expect(JSON.stringify(respuesta.body)).toContain('Idempotency-Key');
  }, 60_000);
});
