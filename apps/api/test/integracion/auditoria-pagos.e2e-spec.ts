import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarPagos, llevarAEstado, sembrarEsquela } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 6 de la 005: corregir un recibo y revisar la auditoría (RF24, RF25). Datos FICTICIOS.

const MOTIVO = 'El cajero digitó mal el número';

describe('Corrección de recibos y auditoría (historia 6 de la 005)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let caja: ClienteConSesion;
  let jefatura: ClienteConSesion;
  let evaluador: ClienteConSesion;

  /** Expediente PENDIENTE_PAGO con su esquela; si `pagar`, caja registra el recibo. */
  const conEsquela = async (recibo: string | null = 'REC-0001') => {
    const { numero } = await sembrarExpediente(prisma, protector);
    await llevarAEstado(prisma, numero, 'PENDIENTE_PAGO');
    const codigo = await sembrarEsquela(prisma, numero);
    if (recibo !== null) {
      await caja.pedir('post', `/esquelas/${codigo}/pago`, { numeroRecibo: recibo }).expect(201);
    }
    return { numero, codigo };
  };

  const corregir = (codigo: string, cuerpo: object) =>
    jefatura.pedir('patch', `/esquelas/${codigo}/recibo`, cuerpo);

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    caja = await clienteConRoles(app, prisma, redis, ['CAJA']);
    jefatura = await clienteConRoles(app, prisma, redis, ['JEFATURA']);
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

  it('la jefatura corrige con motivo: CORREGIR_RECIBO con el anterior y el nuevo', async () => {
    const { codigo } = await conEsquela();

    const respuesta = await corregir(codigo, { numeroRecibo: 'rec-0002', motivo: MOTIVO });

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('patch', '/esquelas/{codigoEsquela}/recibo', respuesta);
    expect(respuesta.body).toMatchObject({ pagada: true, numeroRecibo: 'REC-0002' });
    expect(
      await prisma.auditoriaPagos.findFirst({ where: { accion: 'CORREGIR_RECIBO' } }),
    ).toMatchObject({
      usuario_id: jefatura.usuario.id,
      codigo_esquela: codigo,
      recibo_anterior: 'REC-0001',
      recibo_nuevo: 'REC-0002',
      motivo: MOTIVO,
    });
  });

  it('sin motivo responde 422; una esquela no pagada 409; un recibo repetido 409', async () => {
    const pagada = await conEsquela('REC-0001');
    const otra = await conEsquela('REC-0005');
    const pendiente = await conEsquela(null);

    const sinMotivo = await corregir(pagada.codigo, { numeroRecibo: 'REC-0002' });
    const motivoCorto = await corregir(pagada.codigo, {
      numeroRecibo: 'REC-0002',
      motivo: 'corto',
    });
    const noPagada = await corregir(pendiente.codigo, { numeroRecibo: 'REC-0002', motivo: MOTIVO });
    const repetido = await corregir(otra.codigo, { numeroRecibo: 'REC-0001', motivo: MOTIVO });

    expect(sinMotivo.status).toBe(422);
    expect(motivoCorto.status).toBe(422);
    await esperarCumpleContrato('patch', '/esquelas/{codigoEsquela}/recibo', sinMotivo);
    expect(noPagada.status).toBe(409);
    expect(repetido.status).toBe(409);
    expect((repetido.body as { type: string }).type).toMatch(/recibo-repetido$/);
  });

  it('otro rol no corrige ni lee la auditoría (403)', async () => {
    const { codigo } = await conEsquela();

    expect(
      (
        await caja.pedir('patch', `/esquelas/${codigo}/recibo`, {
          numeroRecibo: 'REC-0002',
          motivo: MOTIVO,
        })
      ).status,
    ).toBe(403);
    expect((await evaluador.pedir('get', '/pagos/auditoria')).status).toBe(403);
  });

  it('GET /pagos/auditoria: del más reciente al más antiguo, paginada, con nombres y sin datos del titular', async () => {
    const { codigo } = await conEsquela('REC-0001');
    await corregir(codigo, { numeroRecibo: 'REC-0002', motivo: MOTIVO }).expect(200);
    await conEsquela('REC-0003');
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

    const primera = await jefatura.pedir(
      'get',
      `/pagos/auditoria?desde=${hoy}&hasta=${hoy}&porPagina=2`,
    );
    const segunda = await jefatura.pedir(
      'get',
      `/pagos/auditoria?desde=${hoy}&hasta=${hoy}&porPagina=2&pagina=2`,
    );
    const ayer = await jefatura.pedir('get', '/pagos/auditoria?desde=2020-01-01&hasta=2020-01-02');

    expect(primera.status).toBe(200);
    expect(primera.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('get', '/pagos/auditoria', primera);
    const cuerpo = primera.body as {
      total: number;
      datos: { accion: string; referencia: string; nombreUsuario: string | null }[];
    };
    expect(cuerpo.total).toBe(3);
    expect(cuerpo.datos.map((r) => r.accion)).toEqual(['REGISTRAR_PAGO', 'CORREGIR_RECIBO']);
    expect(cuerpo.datos[1]).toMatchObject({
      referencia: codigo,
      nombreUsuario: jefatura.usuario.nombre,
    });
    expect((segunda.body as { datos: { accion: string }[] }).datos.map((r) => r.accion)).toEqual([
      'REGISTRAR_PAGO',
    ]);
    expect((ayer.body as { total: number }).total).toBe(0);
    const texto = JSON.stringify([primera.body, segunda.body]);
    expect(texto).not.toContain(TITULAR_DE_PRUEBA.documento);
    expect(texto).not.toContain(TITULAR_DE_PRUEBA.nombre);
  });

  it('GET /pagos/auditoria con fechas inválidas responde 422', async () => {
    const respuesta = await jefatura.pedir('get', '/pagos/auditoria?desde=20-11-2026');

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('get', '/pagos/auditoria', respuesta);
  });

  it('GET /expedientes/{n}/auditoria: las decisiones con el nombre del usuario', async () => {
    const { numero } = await sembrarExpediente(prisma, protector);
    const version = (await prisma.expediente.findUniqueOrThrow({ where: { numero } })).version;
    await evaluador
      .pedir('post', `/expedientes/${numero}/evaluacion`, {})
      .set('If-Match', String(version))
      .expect(200);

    const respuesta = await jefatura.pedir('get', `/expedientes/${numero}/auditoria`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('get', '/expedientes/{numeroExpediente}/auditoria', respuesta);
    expect(respuesta.body).toEqual([
      expect.objectContaining({
        usuarioId: evaluador.usuario.id,
        nombreUsuario: evaluador.usuario.nombre,
        accion: 'INICIAR_EVALUACION',
        referencia: numero,
      }),
    ]);
    expect(JSON.stringify(respuesta.body)).not.toContain(TITULAR_DE_PRUEBA.documento);
    expect((await jefatura.pedir('get', '/expedientes/EXP-2026-999999/auditoria')).status).toBe(
      404,
    );
    expect((await evaluador.pedir('get', `/expedientes/${numero}/auditoria`)).status).toBe(403);
  });
});
