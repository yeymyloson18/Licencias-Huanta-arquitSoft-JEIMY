import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { llevarAEstado } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import {
  confirmarIdentidad,
  subirPdf,
  TITULAR_EXTRANJERO,
  TITULAR_PRUEBA_1,
} from '../apoyo/identidad-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 4 de la 005: subsanar la observación (CU05). Datos FICTICIOS del simulado.

describe('Subsanación de la observación (historia 4 de la 005)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let mesa: ClienteConSesion;
  let evaluador: ClienteConSesion;

  /** Expediente OBSERVADO con su observación pendiente y el id de un requisito de su receta. */
  const observado = async (estado: 'OBSERVADO' | 'REGISTRADO' = 'OBSERVADO') => {
    const { id, numero } = await sembrarExpediente(prisma, protector);
    await llevarAEstado(prisma, numero, estado);
    await prisma.observacion.create({
      data: {
        expediente_id: id,
        descripcion: 'Falta el croquis',
        creada_por: evaluador.usuario.id,
      },
    });
    const fila = await prisma.expediente.findUniqueOrThrow({ where: { id } });
    const receta = fila.receta_al_presentar as { requisitos: { id: number }[] };
    return { id, numero, requisitoId: receta.requisitos[0]?.id ?? 0 };
  };

  const subsanar = (numero: string, token: string, cuerpo: object) =>
    request(app.getHttpServer())
      .post(`/api/v1/expedientes/${numero}/subsanar`)
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpo);

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    mesa = await clienteConRoles(app, prisma, redis, ['MESA_PARTES']);
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
  });

  beforeEach(async () => {
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('el titular confirma su identidad, sube y subsana: vuelve a EN_EVALUACION', async () => {
    const { id, numero, requisitoId } = await observado();
    const { token } = await confirmarIdentidad(app, redis, TITULAR_PRUEBA_1);
    const documentoId = await subirPdf(app, token);

    const respuesta = await subsanar(numero, token, {
      identidad: TITULAR_PRUEBA_1,
      documentos: [{ requisitoId, documentoId }],
    });

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/subsanar', respuesta);
    expect(respuesta.body).toMatchObject({ numero, estado: 'EN_EVALUACION' });
    const expediente = await prisma.expediente.findUniqueOrThrow({
      where: { id },
      include: { documento: true, observacion: true },
    });
    expect(expediente.estado).toBe('EN_EVALUACION');
    expect(expediente.documento).toHaveLength(1);
    expect(expediente.observacion[0]?.subsanada_en).not.toBeNull();
    expect(await prisma.documento_temporal.count({ where: { id: documentoId } })).toBe(0);
    expect(
      await prisma.auditoriaTramites.findFirst({ where: { numero_expediente: numero } }),
    ).toMatchObject({ accion: 'SUBSANAR', usuario_id: null });
    expect(
      await prisma.evento_pendiente.count({ where: { tipo: 'EstadoExpedienteCambiado' } }),
    ).toBe(1);
  });

  it('con la identidad de otra persona responde 403 sin revelar nada', async () => {
    const { numero, requisitoId } = await observado();
    const { token } = await confirmarIdentidad(app, redis, TITULAR_EXTRANJERO);
    const documentoId = await subirPdf(app, token);

    const respuesta = await subsanar(numero, token, {
      identidad: TITULAR_EXTRANJERO,
      documentos: [{ requisitoId, documentoId }],
    });

    expect(respuesta.status).toBe(403);
    expect(JSON.stringify(respuesta.body)).not.toMatch(/OBSERVADO|40000001|Titular/);
    expect((await prisma.expediente.findUniqueOrThrow({ where: { numero } })).estado).toBe(
      'OBSERVADO',
    );
  });

  it('mesa de partes subsana con sus documentos', async () => {
    const { numero, requisitoId } = await observado();
    const documentoId = await subirPdf(app, mesa.token);

    const respuesta = await subsanar(numero, mesa.token, {
      documentos: [{ requisitoId, documentoId }],
    });

    expect(respuesta.status).toBe(200);
    expect(
      await prisma.auditoriaTramites.findFirst({ where: { numero_expediente: numero } }),
    ).toMatchObject({ accion: 'SUBSANAR', usuario_id: mesa.usuario.id });
  });

  it('el evaluador no puede subsanar (403)', async () => {
    const { numero, requisitoId } = await observado();

    const respuesta = await subsanar(numero, evaluador.token, {
      documentos: [{ requisitoId, documentoId: '00000000-0000-4000-8000-000000000d01' }],
    });

    expect(respuesta.status).toBe(403);
  });

  it('un expediente que no está OBSERVADO responde 409', async () => {
    const { numero, requisitoId } = await observado('REGISTRADO');
    const documentoId = await subirPdf(app, mesa.token);

    const respuesta = await subsanar(numero, mesa.token, {
      documentos: [{ requisitoId, documentoId }],
    });

    expect(respuesta.status).toBe(409);
    await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/subsanar', respuesta);
  });

  it('sin documentos responde 422', async () => {
    const { numero } = await observado();

    const respuesta = await subsanar(numero, mesa.token, { documentos: [] });

    expect(respuesta.status).toBe(422);
  });
});
