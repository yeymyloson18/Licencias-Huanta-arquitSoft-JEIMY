import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import {
  limpiarPagos,
  llevarAEstado,
  procesarEventos,
  versionDe,
} from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 1 de la 005: evaluar el expediente y confirmar el riesgo (CU13). Datos FICTICIOS.

describe('Evaluación del expediente (historia 1 de la 005)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let evaluador: ClienteConSesion;

  const sembrar = async (codigoReceta = 'LIC-02') =>
    (await sembrarExpediente(prisma, protector, { codigoReceta })).numero;

  const decidir = (
    numero: string,
    accion: 'evaluacion' | 'riesgo' | 'observar' | 'denegar',
    version: number,
    cuerpo: object = {},
  ) =>
    evaluador
      .pedir('post', `/expedientes/${numero}/${accion}`, cuerpo)
      .set('If-Match', String(version));

  const enEvaluacion = async (codigoReceta = 'LIC-02') => {
    const numero = await sembrar(codigoReceta);
    return { numero, version: await llevarAEstado(prisma, numero, 'EN_EVALUACION') };
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
  });

  beforeEach(async () => {
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('empezar la revisión: REGISTRADO → EN_EVALUACION con el evaluador y la auditoría', async () => {
    const numero = await sembrar();

    const respuesta = await decidir(numero, 'evaluacion', await versionDe(prisma, numero));

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/evaluacion', respuesta);
    expect(respuesta.body).toMatchObject({ estado: 'EN_EVALUACION' });
    expect(
      (respuesta.body as { licenciasDelGrupo: { codigoReceta: string }[] }).licenciasDelGrupo.map(
        (l) => l.codigoReceta,
      ),
    ).toEqual(['LIC-01', 'LIC-02', 'LIC-03', 'LIC-04']);
    const fila = await prisma.expediente.findUniqueOrThrow({ where: { numero } });
    expect(fila.evaluador_id).toBe(evaluador.usuario.id);
    expect(
      await prisma.auditoriaTramites.count({
        where: { numero_expediente: numero, accion: 'INICIAR_EVALUACION' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditoriaTramites.count({
        where: { numero_expediente: numero, accion: 'VER_DETALLE' },
      }),
    ).toBe(0);
  });

  it('confirmar el riesgo: PENDIENTE_PAGO y, tras procesar la cola, una esquela con la tasa', async () => {
    const { numero, version } = await enEvaluacion();

    const respuesta = await decidir(numero, 'riesgo', version);

    expect(respuesta.status).toBe(200);
    await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/riesgo', respuesta);
    expect(respuesta.body).toMatchObject({
      estado: 'PENDIENTE_PAGO',
      nivelRiesgoPropuesto: 'MEDIO',
      nivelRiesgoConfirmado: 'MEDIO',
      licenciasDelGrupo: [],
    });
    expect(await prisma.esquela.count()).toBe(0);
    await procesarEventos(app);
    const esquela = await prisma.esquela.findUniqueOrThrow({
      where: { numero_expediente: numero },
    });
    expect(esquela).toMatchObject({
      codigo: `ESQ-${numero}`,
      codigo_receta: 'LIC-02',
      numero_recibo: null,
    });
    expect(esquela.monto.toFixed(2)).toBe('177.10');
    expect(
      await prisma.evento_pendiente.count({
        where: { tipo: 'EsquelaSolicitada', procesado_en: null },
      }),
    ).toBe(0);
  });

  it('confirmar de nuevo responde 409 y sigue habiendo una sola esquela', async () => {
    const { numero, version } = await enEvaluacion();
    await decidir(numero, 'riesgo', version).expect(200);

    const otra = await decidir(numero, 'riesgo', version + 1);

    expect(otra.status).toBe(409);
    await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/riesgo', otra);
    expect((otra.body as { title: string }).title).toContain('PENDIENTE_PAGO');
    await procesarEventos(app);
    expect(await prisma.esquela.count()).toBe(1);
  });

  it('10 confirmaciones en paralelo crean una sola esquela', async () => {
    const { numero, version } = await enEvaluacion();

    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => decidir(numero, 'riesgo', version)),
    );
    await procesarEventos(app);

    expect(respuestas.filter((r) => r.status === 200)).toHaveLength(1);
    expect(respuestas.every((r) => [200, 409, 412].includes(r.status))).toBe(true);
    expect(await prisma.esquela.count()).toBe(1);
    expect(await prisma.evento_pendiente.count({ where: { tipo: 'EsquelaSolicitada' } })).toBe(1);
  });

  it('corregir a riesgo alto: toma la ruta B y la tasa 305.90', async () => {
    const { numero, version } = await enEvaluacion();

    const respuesta = await decidir(numero, 'riesgo', version, { codigoReceta: 'LIC-03' });
    await procesarEventos(app);

    expect(respuesta.body).toMatchObject({
      codigoReceta: 'LIC-03',
      ruta: 'B',
      nivelRiesgoConfirmado: 'ALTO',
    });
    expect((await prisma.esquela.findFirstOrThrow()).monto.toFixed(2)).toBe('305.90');
    expect(
      await prisma.auditoriaTramites.findFirstOrThrow({
        where: { numero_expediente: numero, accion: 'CORREGIR_RIESGO' },
      }),
    ).toMatchObject({ detalle: { codigoRecetaAnterior: 'LIC-02', codigoRecetaNueva: 'LIC-03' } });
  });

  it('corregir a otro grupo responde 422', async () => {
    const { numero, version } = await enEvaluacion();

    const respuesta = await decidir(numero, 'riesgo', version, { codigoReceta: 'LIC-07' });

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/riesgo', respuesta);
    expect(JSON.stringify(respuesta.body)).toContain('codigoReceta');
  });

  it('una licencia de bodega (tasa 0.00) pasa a PAGADO sin esquela', async () => {
    const { numero, version } = await enEvaluacion('LIC-09');

    const respuesta = await decidir(numero, 'riesgo', version);
    await procesarEventos(app);

    expect(respuesta.body).toMatchObject({ estado: 'PAGADO' });
    expect(await prisma.esquela.count()).toBe(0);
    const historial = await prisma.historial_estado.findMany({
      where: { expediente: { numero } },
      orderBy: { ocurrido_en: 'asc' },
    });
    expect(historial.at(-1)).toMatchObject({
      estado_nuevo: 'PAGADO',
      comentario: 'Sin pago: tasa 0.00',
    });
  });

  it('observar una vez; la segunda (tras subsanar) responde 409 ya-observado', async () => {
    const { numero, version } = await enEvaluacion();

    const observado = await decidir(numero, 'observar', version, {
      descripcion: 'Falta el croquis de ubicación',
    });
    expect(observado.status).toBe(200);
    await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/observar', observado);
    expect(observado.body).toMatchObject({
      estado: 'OBSERVADO',
      observaciones: [
        {
          descripcion: 'Falta el croquis de ubicación',
          // 006: 2 días hábiles para subsanar.
          plazoSubsanarEn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown,
          subsanadaEn: null,
        },
      ],
    });

    const otraVersion = await llevarAEstado(prisma, numero, 'EN_EVALUACION');
    const segunda = await decidir(numero, 'observar', otraVersion, {
      descripcion: 'Falta otro documento más',
    });
    expect(segunda.status).toBe(409);
    expect((segunda.body as { type: string }).type).toMatch(/ya-observado$/);
  });

  it('un texto de observación corto responde 422', async () => {
    const { numero, version } = await enEvaluacion();

    const respuesta = await decidir(numero, 'observar', version, { descripcion: 'Falta' });

    expect(respuesta.status).toBe(422);
  });

  it('denegar deja DENEGADO y luego cualquier acción responde 409', async () => {
    const { numero, version } = await enEvaluacion();

    const denegado = await decidir(numero, 'denegar', version, {
      motivo: 'El giro no está permitido en la zona',
    });
    expect(denegado.status).toBe(200);
    await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/denegar', denegado);
    expect(denegado.body).toMatchObject({ estado: 'DENEGADO' });

    for (const accion of ['evaluacion', 'riesgo', 'observar', 'denegar'] as const) {
      const respuesta = await decidir(numero, accion, version + 1, {
        ...(accion === 'observar' ? { descripcion: 'Falta el croquis de ubicación' } : {}),
        ...(accion === 'denegar' ? { motivo: 'El giro no está permitido en la zona' } : {}),
      });
      expect(respuesta.status).toBe(409);
    }
  });

  it('una versión vieja responde 412 y sin If-Match 422', async () => {
    const { numero, version } = await enEvaluacion();

    const vieja = await decidir(numero, 'riesgo', version - 1);
    const sinVersion = await evaluador.pedir('post', `/expedientes/${numero}/riesgo`, {});

    expect(vieja.status).toBe(412);
    await esperarCumpleContrato('post', '/expedientes/{numeroExpediente}/riesgo', vieja);
    expect(sinVersion.status).toBe(422);
    expect(JSON.stringify(sinVersion.body)).toContain('If-Match');
  });

  it('un expediente inexistente responde 404', async () => {
    const respuesta = await decidir('EXP-2026-999999', 'evaluacion', 1);

    expect(respuesta.status).toBe(404);
  });

  it('el estado cambiado queda como evento para las notificaciones (006)', async () => {
    const { numero, version } = await enEvaluacion();

    await decidir(numero, 'denegar', version, { motivo: 'El giro no está permitido en la zona' });

    const evento = await prisma.evento_pendiente.findFirstOrThrow({
      where: { tipo: 'EstadoExpedienteCambiado' },
    });
    expect(evento.datos).toEqual({
      numeroExpediente: numero,
      estadoAnterior: 'EN_EVALUACION',
      estadoNuevo: 'DENEGADO',
    });
  });
});
