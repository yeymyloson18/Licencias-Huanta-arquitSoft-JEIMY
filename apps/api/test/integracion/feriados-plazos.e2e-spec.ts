import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { FachadaPlazos } from '../../src/modulos/plazos/fachada';
import { FachadaTramites } from '../../src/modulos/tramites/fachada';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { llevarAEstado, versionDe } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { subirPdf } from '../apoyo/identidad-prueba';
import { limpiar006 } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 3 de la 006: feriados y plazos en días hábiles. Datos FICTICIOS.

const hoyLima = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

describe('Feriados y plazos en días hábiles (historia 3 de la 006)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let administrador: ClienteConSesion;
  let evaluador: ClienteConSesion;
  let mesa: ClienteConSesion;
  let plazos: FachadaPlazos;

  const venceDe = async (numero: string) => {
    const fila = await prisma.expediente.findUniqueOrThrow({ where: { numero } });
    return {
      vence: fila.vence_plazo_en?.toISOString().slice(0, 10) ?? null,
      restante: fila.plazo_restante_dias,
    };
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    plazos = app.get(FachadaPlazos);
    await limpiarClavesSeguridad(redis);
    administrador = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
    mesa = await clienteConRoles(app, prisma, redis, ['MESA_PARTES']);
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

  it('los 16 feriados nacionales de 2026 vienen sembrados; cualquiera del personal los ve', async () => {
    const respuesta = await evaluador.pedir('get', '/feriados?anio=2026');

    expect(respuesta.status).toBe(200);
    await esperarCumpleContrato('get', '/feriados', respuesta);
    const feriados = respuesta.body as { fecha: string; alcance: string }[];
    expect(feriados).toHaveLength(16);
    expect(feriados.every((f) => f.alcance === 'NACIONAL')).toBe(true);
    expect(feriados.map((f) => f.fecha)).toEqual(
      expect.arrayContaining(['2026-07-28', '2026-12-09']),
    );
    expect((await evaluador.pedir('get', '/feriados?anio=1999')).status).toBe(422);
  });

  it('el administrador registra y elimina; repetido 409; otro rol 403', async () => {
    const nuevo = { fecha: '2027-06-24', descripcion: 'Inti Raymi', alcance: 'REGIONAL' };

    const creado = await administrador.pedir('post', '/feriados', nuevo);
    expect(creado.status).toBe(201);
    await esperarCumpleContrato('post', '/feriados', creado);
    expect(creado.body).toEqual(nuevo);
    expect((await administrador.pedir('post', '/feriados', nuevo)).status).toBe(409);
    expect(
      (await administrador.pedir('post', '/feriados', { ...nuevo, fecha: '2027-02-30' })).status,
    ).toBe(422);
    expect(
      (await evaluador.pedir('post', '/feriados', { ...nuevo, fecha: '2027-06-25' })).status,
    ).toBe(403);

    const lista = await administrador.pedir('get', '/feriados?anio=2027');
    expect(lista.body).toEqual([nuevo]);
    const borrado = await administrador.pedir('delete', '/feriados/2027-06-24');
    expect(borrado.status).toBe(204);
    expect((await administrador.pedir('delete', '/feriados/2027-06-24')).status).toBe(404);
    expect((await evaluador.pedir('delete', '/feriados/2026-12-25')).status).toBe(403);
  });

  it('completa una vez el vencimiento de los expedientes antiguos (y el suspendido guarda días)', async () => {
    const enTramite = (await sembrarExpediente(prisma, protector)).numero;
    const observado = (await sembrarExpediente(prisma, protector)).numero;
    await llevarAEstado(prisma, observado, 'OBSERVADO');
    const fachada = app.get(FachadaTramites);

    expect(await fachada.completarVencimientos()).toBe(2);
    expect(await fachada.completarVencimientos()).toBe(0);

    const presentado = (await prisma.expediente.findUniqueOrThrow({ where: { numero: enTramite } }))
      .presentado_en;
    const esperado = await plazos.sumarDiasHabiles(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(presentado),
      2,
    );
    expect(await venceDe(enTramite)).toEqual({ vence: esperado, restante: null });
    expect(await venceDe(observado)).toEqual({
      vence: null,
      restante: Math.max(0, await plazos.diasHabilesRestantes(hoyLima(), esperado)),
    });
  });

  it('observar suspende el plazo y fija 2 días para subsanar; subsanar lo reanuda', async () => {
    const { numero, id } = await sembrarExpediente(prisma, protector);
    await app.get(FachadaTramites).completarVencimientos();
    await evaluador
      .pedir('post', `/expedientes/${numero}/evaluacion`, {})
      .set('If-Match', String(await versionDe(prisma, numero)))
      .expect(200);
    const antes = await venceDe(numero);

    const observado = await evaluador
      .pedir('post', `/expedientes/${numero}/observar`, {
        descripcion: 'Falta el croquis de ubicación',
      })
      .set('If-Match', String(await versionDe(prisma, numero)));

    expect(observado.status).toBe(200);
    const restante = Math.max(
      0,
      await plazos.diasHabilesRestantes(hoyLima(), antes.vence ?? hoyLima()),
    );
    expect(await venceDe(numero)).toEqual({ vence: null, restante });
    const observacion = await prisma.observacion.findFirstOrThrow({ where: { expediente_id: id } });
    expect(observacion.plazo_subsanar_en?.toISOString().slice(0, 10)).toBe(
      await plazos.sumarDiasHabiles(hoyLima(), 2),
    );

    const fila = await prisma.expediente.findUniqueOrThrow({ where: { id } });
    const requisito =
      (fila.receta_al_presentar as { requisitos: { id: number }[] }).requisitos[0]?.id ?? 0;
    await mesa
      .pedir('post', `/expedientes/${numero}/subsanar`, {
        documentos: [{ requisitoId: requisito, documentoId: await subirPdf(app, mesa.token) }],
      })
      .expect(200);

    expect(await venceDe(numero)).toEqual({
      vence: await plazos.sumarDiasHabiles(hoyLima(), restante),
      restante: null,
    });
  });
});
