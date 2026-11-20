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
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';
import { JPG_PRUEBA, PDF_PRUEBA, PNG_PRUEBA } from '../apoyo/identidad-prueba';
import { limpiar006, procesarTodo } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 2 de la 006: inspecciones ITSE. Datos FICTICIOS.

const hoyLima = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

describe('Inspecciones ITSE (historia 2 de la 006)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let jefatura: ClienteConSesion;
  let inspector: ClienteConSesion;
  let otroInspector: ClienteConSesion;
  let evaluador: ClienteConSesion;

  /** Expediente EN_INSPECCION de ruta B con su inspección PREVIA creada por el evento. */
  const conInspeccion = async () => {
    const { numero } = await sembrarExpediente(prisma, protector, { codigoReceta: 'LIC-03' });
    await llevarAEstado(prisma, numero, 'EN_INSPECCION', { ruta: 'B' });
    await prisma.evento_pendiente.create({
      data: { tipo: 'InspeccionRequerida', datos: { numeroExpediente: numero, tipo: 'PREVIA' } },
    });
    await procesarTodo(app);
    const inspeccion = await prisma.inspeccion.findFirstOrThrow({
      where: { numero_expediente: numero },
    });
    return { numero, id: inspeccion.id };
  };

  const asignar = (id: string, inspectorId = inspector.usuario.id, programadaPara = hoyLima()) =>
    jefatura.pedir('post', `/inspecciones/${id}/asignar`, { inspectorId, programadaPara });

  const registrar = (
    cliente: ClienteConSesion,
    id: string,
    campos: Record<string, string>,
    fotos: { contenido: Buffer; nombre: string }[] = [
      { contenido: JPG_PRUEBA, nombre: 'frente.jpg' },
      { contenido: PNG_PRUEBA, nombre: 'extintor.png' },
    ],
  ) => {
    let pedido = request(app.getHttpServer())
      .post(`/api/v1/inspecciones/${id}/resultado`)
      .set('Authorization', `Bearer ${cliente.token}`);
    for (const [campo, valor] of Object.entries(campos)) {
      pedido = pedido.field(campo, valor);
    }
    for (const foto of fotos) {
      pedido = pedido.attach('fotos', foto.contenido, foto.nombre);
    }
    return pedido;
  };

  const FAVORABLE = {
    resultado: 'FAVORABLE',
    numeroCertificado: 'itse 2026-0001',
    certificadoEmitidoEn: '',
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    jefatura = await clienteConRoles(app, prisma, redis, ['JEFATURA']);
    inspector = await clienteConRoles(app, prisma, redis, ['INSPECTOR']);
    otroInspector = await clienteConRoles(app, prisma, redis, ['INSPECTOR']);
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
  });

  beforeEach(async () => {
    await limpiar006(prisma);
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiar006(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('InspeccionRequerida repetida crea una sola inspección PENDIENTE', async () => {
    const { numero } = await conInspeccion();
    await prisma.evento_pendiente.create({
      data: { tipo: 'InspeccionRequerida', datos: { numeroExpediente: numero, tipo: 'PREVIA' } },
    });
    await procesarTodo(app);

    const inspecciones = await prisma.inspeccion.findMany({ where: { numero_expediente: numero } });
    expect(inspecciones).toHaveLength(1);
    expect(inspecciones[0]).toMatchObject({ tipo: 'PREVIA', estado: 'PENDIENTE' });
  });

  it('la jefatura lista y asigna; inspector inválido o fecha pasada → 422', async () => {
    const { id } = await conInspeccion();

    const lista = await jefatura.pedir('get', '/inspecciones');
    expect(lista.status).toBe(200);
    await esperarCumpleContrato('get', '/inspecciones', lista);
    expect((lista.body as { datos: object[] }).datos[0]).not.toHaveProperty('direccion');
    expect((lista.body as { datos: { giro: string }[] }).datos[0]?.giro).toBe('Bodega y abarrotes');

    const inspectores = await jefatura.pedir('get', '/inspecciones/inspectores');
    await esperarCumpleContrato('get', '/inspecciones/inspectores', inspectores);
    expect((inspectores.body as { id: string }[]).map((i) => i.id)).toEqual(
      expect.arrayContaining([inspector.usuario.id, otroInspector.usuario.id]),
    );

    expect((await asignar(id, evaluador.usuario.id)).status).toBe(422);
    expect((await asignar(id, inspector.usuario.id, '2020-01-01')).status).toBe(422);
    const asignada = await asignar(id);
    expect(asignada.status).toBe(200);
    await esperarCumpleContrato('post', '/inspecciones/{inspeccionId}/asignar', asignada);
    expect(asignada.body).toMatchObject({ estado: 'ASIGNADA', inspectorId: inspector.usuario.id });
    expect(
      await prisma.auditoriaInspecciones.findFirst({ where: { inspeccion_id: id } }),
    ).toMatchObject({
      accion: 'ASIGNAR_INSPECTOR',
      usuario_id: jefatura.usuario.id,
    });
  });

  it('el inspector ve solo las suyas, con la dirección del local', async () => {
    const mia = await conInspeccion();
    const ajena = await conInspeccion();
    await asignar(mia.id).expect(200);
    await asignar(ajena.id, otroInspector.usuario.id).expect(200);

    const lista = await inspector.pedir('get', '/inspecciones');

    const datos = (lista.body as { datos: { id: string; direccion?: string }[] }).datos;
    expect(datos.map((d) => d.id)).toEqual([mia.id]);
    expect(datos[0]?.direccion).toBe(TITULAR_DE_PRUEBA.direccion);
  });

  it('el asignado registra con fotos una sola vez; otro inspector → 403', async () => {
    const { id } = await conInspeccion();
    await asignar(id).expect(200);

    expect(
      (await registrar(otroInspector, id, { ...FAVORABLE, certificadoEmitidoEn: hoyLima() }))
        .status,
    ).toBe(403);
    const respuesta = await registrar(inspector, id, {
      ...FAVORABLE,
      certificadoEmitidoEn: hoyLima(),
    });
    expect(respuesta.status).toBe(201);
    await esperarCumpleContrato('post', '/inspecciones/{inspeccionId}/resultado', respuesta);
    expect(respuesta.body).toMatchObject({
      estado: 'REALIZADA',
      resultado: 'FAVORABLE',
      numeroCertificado: 'ITSE2026-0001',
    });
    expect(await prisma.foto.count({ where: { inspeccion_id: id } })).toBe(2);
    const auditoria = await prisma.auditoriaInspecciones.findFirst({
      where: { inspeccion_id: id, accion: 'REGISTRAR_RESULTADO' },
    });
    expect(auditoria).toMatchObject({
      usuario_id: inspector.usuario.id,
      detalle: { resultado: 'FAVORABLE', fotos: 2 },
    });
    expect(
      await prisma.evento_pendiente.count({ where: { tipo: 'ResultadoITSERegistrado' } }),
    ).toBe(1);

    const segundo = await registrar(inspector, id, {
      ...FAVORABLE,
      certificadoEmitidoEn: hoyLima(),
    });
    expect(segundo.status).toBe(409);
    expect((segundo.body as { type: string }).type).toMatch(/ya-registrada$/);
    expect((await asignar(id, otroInspector.usuario.id)).status).toBe(409);
  });

  it('archivo que no es imagen, sin fotos, 6 fotos o sin certificado → 422 sin guardar nada', async () => {
    const { id } = await conInspeccion();
    await asignar(id).expect(200);
    const campos = { ...FAVORABLE, certificadoEmitidoEn: hoyLima() };

    const disfrazado = await registrar(inspector, id, campos, [
      { contenido: PDF_PRUEBA, nombre: 'foto.jpg' },
    ]);
    const sinFotos = await registrar(inspector, id, campos, []);
    const seis = await registrar(
      inspector,
      id,
      campos,
      Array.from({ length: 6 }, (_, i) => ({ contenido: JPG_PRUEBA, nombre: `f${String(i)}.jpg` })),
    );
    const sinCertificado = await registrar(inspector, id, { resultado: 'FAVORABLE' });
    const desfavorableSinMotivo = await registrar(inspector, id, { resultado: 'DESFAVORABLE' });

    for (const respuesta of [disfrazado, sinFotos, seis, sinCertificado, desfavorableSinMotivo]) {
      expect(respuesta.status).toBe(422);
    }
    await esperarCumpleContrato('post', '/inspecciones/{inspeccionId}/resultado', disfrazado);
    expect(await prisma.foto.count()).toBe(0);
    expect((await prisma.inspeccion.findUniqueOrThrow({ where: { id } })).estado).toBe('ASIGNADA');
  });

  it('una inspección inexistente → 404; sin asignar, ningún inspector registra', async () => {
    const { id } = await conInspeccion();

    expect(
      (
        await registrar(inspector, '00000000-0000-4000-8000-000000000000', {
          resultado: 'DESFAVORABLE',
          observaciones: 'x',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await registrar(inspector, id, {
          resultado: 'DESFAVORABLE',
          observaciones: 'Sin extintores',
        })
      ).status,
    ).toBe(403);
  });
});
