import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarTramites } from '../apoyo/expedientes-prueba';
import {
  confirmarIdentidad,
  JPG_PRUEBA,
  PDF_PRUEBA,
  PNG_PRUEBA,
  subirDocumentoPrueba,
} from '../apoyo/identidad-prueba';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// FR-013 y SC-008 de la 004 (contracts/identidad-y-solicitud.md, "Documentos").

describe('Subida de documentos antes de presentar (FR-013 de la 004)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let token: string;

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    await limpiarClavesSeguridad(redis);
    ({ token } = await confirmarIdentidad(app, redis));
  });

  afterAll(async () => {
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it.each([
    ['un PDF', PDF_PRUEBA, 'solicitud.pdf', 'application/pdf'],
    ['un JPG', JPG_PRUEBA, 'foto.jpg', 'image/jpeg'],
    ['un PNG', PNG_PRUEBA, 'plano.png', 'image/png'],
  ])('acepta %s real y devuelve su SHA-256', async (_, contenido, nombre, tipo) => {
    const respuesta = await subirDocumentoPrueba(app, token, contenido, nombre);

    expect(respuesta.status).toBe(201);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('post', '/documentos', respuesta);
    const { documentoId, sha256 } = respuesta.body as { documentoId: string; sha256: string };
    expect(sha256).toBe(createHash('sha256').update(contenido).digest('hex'));
    const fila = await prisma.documento_temporal.findUniqueOrThrow({ where: { id: documentoId } });
    expect(fila).toMatchObject({ tipo_mime: tipo, nombre_original: nombre, usuario_id: null });
    expect(fila.clave_almacen).not.toContain(nombre);
  });

  it('rechaza con 415 un texto renombrado a .pdf (SC-008)', async () => {
    const respuesta = await subirDocumentoPrueba(
      app,
      token,
      Buffer.from('soy un texto, no un PDF'),
      'falso.pdf',
    );

    expect(respuesta.status).toBe(415);
    await esperarCumpleContrato('post', '/documentos', respuesta);
  });

  it('rechaza con 413 un archivo de más de 10 MB (SC-008)', async () => {
    const grande = Buffer.alloc(11 * 1024 * 1024, 0x20);
    PDF_PRUEBA.copy(grande);

    const respuesta = await subirDocumentoPrueba(app, token, grande, 'grande.pdf');

    expect(respuesta.status).toBe(413);
    await esperarCumpleContrato('post', '/documentos', respuesta);
  });

  it('sin archivo responde 422', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/documentos')
      .set('Authorization', `Bearer ${token}`)
      .field('otro', 'valor');

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('post', '/documentos', respuesta);
  });

  it('sin token responde 401 y no guarda nada', async () => {
    const antes = await prisma.documento_temporal.count();

    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/documentos')
      .attach('archivo', PDF_PRUEBA, 'solicitud.pdf');

    expect(respuesta.status).toBe(401);
    await esperarCumpleContrato('post', '/documentos', respuesta);
    expect(await prisma.documento_temporal.count()).toBe(antes);
  });

  it('un token alterado responde 401', async () => {
    const respuesta = await subirDocumentoPrueba(app, `${token}x`);

    expect(respuesta.status).toBe(401);
  });
});
