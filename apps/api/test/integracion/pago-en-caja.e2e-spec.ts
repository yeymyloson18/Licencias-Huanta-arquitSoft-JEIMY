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
  sembrarEsquela,
} from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 2 de la 005: registrar el pago en caja (CU16). Datos FICTICIOS.

describe('Pago en caja (historia 2 de la 005)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let caja: ClienteConSesion;

  /** Expediente PENDIENTE_PAGO con su esquela pendiente. */
  const conEsquela = async (estado: 'PENDIENTE_PAGO' | 'DENEGADO' = 'PENDIENTE_PAGO') => {
    const { numero } = await sembrarExpediente(prisma, protector);
    await llevarAEstado(prisma, numero, estado);
    return { numero, codigo: await sembrarEsquela(prisma, numero) };
  };

  const pagar = (codigo: string, numeroRecibo: string) =>
    caja.pedir('post', `/esquelas/${codigo}/pago`, { numeroRecibo });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    caja = await clienteConRoles(app, prisma, redis, ['CAJA']);
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

  it('caja consulta la esquela (en minúsculas) y el titular antes de confirmar', async () => {
    const { numero, codigo } = await conEsquela();

    const esquela = await caja.pedir('get', `/esquelas/${codigo.toLowerCase()}`);
    const titular = await caja.pedir('get', `/expedientes/${numero}/titular`);

    expect(esquela.status).toBe(200);
    expect(esquela.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('get', '/esquelas/{codigoEsquela}', esquela);
    expect(esquela.body).toMatchObject({
      codigo,
      numeroExpediente: numero,
      monto: '177.10',
      pagada: false,
      estadoExpediente: 'PENDIENTE_PAGO',
    });
    expect(titular.status).toBe(200);
    await esperarCumpleContrato('get', '/expedientes/{numeroExpediente}/titular', titular);
    expect(titular.body).toEqual({
      numeroExpediente: numero,
      nombreTitular: TITULAR_DE_PRUEBA.nombre,
      razonSocial: null,
    });
    expect(JSON.stringify(titular.body)).not.toContain(TITULAR_DE_PRUEBA.documento);
  });

  it('registra el pago con auditoría y evento; tras procesar la cola, el expediente está PAGADO', async () => {
    const { numero, codigo } = await conEsquela();

    const respuesta = await pagar(codigo, ' rec-0001 ');

    expect(respuesta.status).toBe(201);
    await esperarCumpleContrato('post', '/esquelas/{codigoEsquela}/pago', respuesta);
    expect(respuesta.body).toMatchObject({ pagada: true, numeroRecibo: 'REC-0001' });
    expect(await prisma.auditoriaPagos.findMany({ where: { codigo_esquela: codigo } })).toEqual([
      expect.objectContaining({
        accion: 'REGISTRAR_PAGO',
        usuario_id: caja.usuario.id,
        recibo_nuevo: 'REC-0001',
      }),
    ]);
    expect((await prisma.expediente.findUniqueOrThrow({ where: { numero } })).estado).toBe(
      'PENDIENTE_PAGO',
    );

    await procesarEventos(app);

    expect((await prisma.expediente.findUniqueOrThrow({ where: { numero } })).estado).toBe(
      'PAGADO',
    );
    const historial = await prisma.historial_estado.findMany({
      where: { expediente: { numero } },
      orderBy: { ocurrido_en: 'asc' },
    });
    expect(historial.at(-1)).toMatchObject({
      estado_nuevo: 'PAGADO',
      usuario_id: null,
      comentario: 'Pago registrado en caja',
    });
  });

  it('un segundo pago de la misma esquela responde 409 esquela-ya-pagada', async () => {
    const { codigo } = await conEsquela();
    await pagar(codigo, 'REC-0001').expect(201);

    const segundo = await pagar(codigo, 'REC-0002');

    expect(segundo.status).toBe(409);
    await esperarCumpleContrato('post', '/esquelas/{codigoEsquela}/pago', segundo);
    expect((segundo.body as { type: string; title: string }).type).toMatch(/esquela-ya-pagada$/);
    expect((segundo.body as { title: string }).title).toBe('Esta esquela ya fue pagada');
  });

  it('10 pagos en paralelo de la misma esquela registran uno solo', async () => {
    const { codigo } = await conEsquela();

    const respuestas = await Promise.all(
      Array.from({ length: 10 }, (_, i) => pagar(codigo, `REC-10${String(i).padStart(2, '0')}`)),
    );

    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(respuestas.filter((r) => r.status === 409)).toHaveLength(9);
    expect(await prisma.auditoriaPagos.count({ where: { codigo_esquela: codigo } })).toBe(1);
    expect(await prisma.evento_pendiente.count({ where: { tipo: 'PagoRegistrado' } })).toBe(1);
  });

  it('un recibo repetido en otra esquela responde 409 recibo-repetido', async () => {
    const primera = await conEsquela();
    const segunda = await conEsquela();
    await pagar(primera.codigo, 'REC-0001').expect(201);

    const respuesta = await pagar(segunda.codigo, 'rec-0001');

    expect(respuesta.status).toBe(409);
    expect((respuesta.body as { type: string }).type).toMatch(/recibo-repetido$/);
    expect(
      (await prisma.esquela.findUniqueOrThrow({ where: { codigo: segunda.codigo } })).numero_recibo,
    ).toBeNull();
  });

  it('un recibo con formato inválido responde 422', async () => {
    const { codigo } = await conEsquela();

    const respuesta = await pagar(codigo, 'A1');

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('post', '/esquelas/{codigoEsquela}/pago', respuesta);
  });

  it('la esquela de un expediente DENEGADO no se paga (409)', async () => {
    const { codigo } = await conEsquela('DENEGADO');

    const respuesta = await pagar(codigo, 'REC-0001');

    expect(respuesta.status).toBe(409);
    expect((respuesta.body as { title: string }).title).toContain('DENEGADO');
  });

  it('un código inexistente o mal formado responde 404', async () => {
    expect((await caja.pedir('get', '/esquelas/ESQ-EXP-2026-999999')).status).toBe(404);
    expect((await caja.pedir('get', '/esquelas/otra-cosa')).status).toBe(404);
    expect((await pagar('ESQ-EXP-2026-999999', 'REC-0001')).status).toBe(404);
  });

  it('si el paso a PAGADO falla, se reintenta y el pago no se pierde', async () => {
    const { numero, codigo } = await conEsquela();
    await pagar(codigo, 'REC-0001').expect(201);
    await prisma.$executeRawUnsafe(
      'ALTER TABLE tramites.historial_estado ADD CONSTRAINT prueba_reintento CHECK (false) NOT VALID',
    );
    try {
      const fallida = await procesarEventos(app);
      expect(fallida).toMatchObject({ fallidos: 1 });
      expect((await prisma.expediente.findUniqueOrThrow({ where: { numero } })).estado).toBe(
        'PENDIENTE_PAGO',
      );
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE tramites.historial_estado DROP CONSTRAINT prueba_reintento',
      );
    }
    const evento = await prisma.evento_pendiente.findFirstOrThrow({
      where: { tipo: 'PagoRegistrado' },
    });
    expect(evento.intentos).toBe(1);
    await prisma.evento_pendiente.update({
      where: { id: evento.id },
      data: { reintentar_en: new Date(Date.now() - 1000) },
    });

    await procesarEventos(app);

    expect((await prisma.expediente.findUniqueOrThrow({ where: { numero } })).estado).toBe(
      'PAGADO',
    );
  });
});
