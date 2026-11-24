import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import type { EnviadorOTP } from '../../src/modulos/seguridad/dominio/puertos/enviador-otp';
import { ENVIADOR_OTP } from '../../src/modulos/seguridad/tokens';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba, type LoggerCapturador } from '../apoyo/aplicacion-prueba';
import { TITULAR_PRUEBA_1, verificarIdentidad } from '../apoyo/identidad-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { leerOtpSimulado, limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { crearUsuarioDePrueba, type UsuarioDePrueba } from '../apoyo/usuarios-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Códigos enviados en la auditoría (010): cada envío queda registrado con el destino enmascarado y
// su desenlace, nunca con el código. La auditoría no se borra: cada prueba filtra por sus ids y por
// la hora de inicio. Datos FICTICIOS.

interface EventoApi {
  accion: string;
  objeto: string | null;
  afectado: { id: string } | null;
  codigoEnviado: {
    proposito: string;
    canal: string;
    destino: string;
    entrega: string;
    desenlace: string | null;
  } | null;
}

describe('Códigos enviados en la auditoría (010)', () => {
  let app: INestApplication<App>;
  let logger: LoggerCapturador;
  let prisma: PrismaServicio;
  let redis: Redis;
  let admin: ClienteConSesion;
  const codigos: string[] = [];

  const filas = (filtro: Prisma.AuditoriaSeguridadWhereInput) =>
    prisma.auditoriaSeguridad.findMany({ where: filtro, orderBy: { id: 'asc' } });

  const pedirCodigo = async (persona: UsuarioDePrueba, origen: string) => {
    const paso1 = await request(app.getHttpServer())
      .post('/api/v1/auth/iniciar-sesion')
      .set('X-Forwarded-For', origen)
      .send({ correo: persona.correo, clave: persona.clave })
      .expect(200);
    const codigo = await leerOtpSimulado(redis, persona.id);
    codigos.push(codigo);
    return { desafioId: (paso1.body as { desafioId: string }).desafioId, codigo };
  };

  const usarCodigo = (desafioId: string, codigo: string, origen: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/verificar-otp')
      .set('X-Forwarded-For', origen)
      .send({ desafioId, codigo });

  const eventosDeLaCuenta = async (usuarioId: string): Promise<EventoApi[]> => {
    const respuesta = await admin
      .pedir('get', `/admin/auditoria?afectadoId=${usuarioId}&accion=CODIGO_ENVIADO`)
      .expect(200);
    await esperarCumpleContrato('get', '/admin/auditoria', respuesta);
    return (respuesta.body as { datos: EventoApi[] }).datos;
  };

  beforeAll(async () => {
    ({ app, logger } = (await crearAplicacionDePrueba()) as {
      app: INestApplication<App>;
      logger: LoggerCapturador;
    });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    admin = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
  });

  beforeEach(async () => {
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('el ingreso del personal registra CODIGO_ENVIADO sobre la cuenta, enmascarado y con su intento', async () => {
    const persona = await crearUsuarioDePrueba(prisma);

    const { desafioId } = await pedirCodigo(persona, '10.7.0.1');

    const [fila] = await filas({ afectado_usuario_id: persona.id, accion: 'CODIGO_ENVIADO' });
    expect(fila).toMatchObject({
      actor_usuario_id: null,
      resultado: 'EXITO',
      intento_id: desafioId,
      detalle: {
        proposito: 'INGRESO_PERSONAL',
        canal: 'SIMULADO',
        destino: `${persona.celular.slice(0, 1)}*****${persona.celular.slice(-3)}`,
        entrega: 'ENTREGADO',
      },
    });
    const [evento] = await eventosDeLaCuenta(persona.id);
    expect(evento?.codigoEnviado).toMatchObject({ desenlace: 'PENDIENTE' });
  });

  // "Sin usar" (vencido) se prueba en las unitarias: la auditoría no se puede envejecer aquí.
  it('el desenlace: ingreso correcto, código incorrecto y pendiente', async () => {
    const persona = await crearUsuarioDePrueba(prisma);
    const primero = await pedirCodigo(persona, '10.7.1.1');
    await usarCodigo(
      primero.desafioId,
      primero.codigo === '000000' ? '111111' : '000000',
      '10.7.1.1',
    ).expect(401);
    const segundo = await pedirCodigo(persona, '10.7.1.2');
    await usarCodigo(segundo.desafioId, segundo.codigo, '10.7.1.2').expect(200);
    await pedirCodigo(persona, '10.7.1.3');

    const eventos = await eventosDeLaCuenta(persona.id);

    // De la más reciente a la más antigua: tercero, segundo, primero.
    expect(eventos.map((e) => e.codigoEnviado?.desenlace)).toEqual([
      'PENDIENTE',
      'INGRESO_CORRECTO',
      'CODIGO_INCORRECTO',
    ]);
    const vinculados = await filas({ intento_id: segundo.desafioId });
    expect(vinculados.map((f) => f.accion)).toEqual(['CODIGO_ENVIADO', 'INGRESO_CORRECTO']);
  });

  it('el cuarto código en 15 minutos registra CODIGO_LIMITE_ALCANZADO', async () => {
    const persona = await crearUsuarioDePrueba(prisma);
    for (let i = 0; i < 3; i += 1) {
      await pedirCodigo(persona, `10.7.2.${String(i)}`);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/iniciar-sesion')
      .set('X-Forwarded-For', '10.7.2.9')
      .send({ correo: persona.correo, clave: persona.clave })
      .expect(429);

    const [limite] = await filas({
      afectado_usuario_id: persona.id,
      accion: 'CODIGO_LIMITE_ALCANZADO',
    });
    expect(limite).toMatchObject({
      resultado: 'RECHAZADO',
      detalle: { proposito: 'INGRESO_PERSONAL' },
    });
  });

  it('la identidad del administrado registra CODIGO_ENVIADO sin cuenta, documento ni RUC', async () => {
    const inicio = new Date();

    await verificarIdentidad(app, TITULAR_PRUEBA_1).expect(200);

    const [fila] = await filas({
      accion: 'CODIGO_ENVIADO',
      objeto: 'IDENTIDAD_ADMINISTRADO',
      ocurrido_en: { gte: inicio },
    });
    expect(fila).toMatchObject({
      afectado_usuario_id: null,
      intento_id: null,
      detalle: { proposito: 'IDENTIDAD_ADMINISTRADO', destino: '9*****001', entrega: 'ENTREGADO' },
    });
    const texto = JSON.stringify(fila, (_, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    for (const dato of [
      TITULAR_PRUEBA_1.numeroDocumento,
      TITULAR_PRUEBA_1.ruc,
      TITULAR_PRUEBA_1.celular,
    ]) {
      expect(texto).not.toContain(dato);
    }
  });

  it('el panel trae los códigos enviados según el contrato', async () => {
    const respuesta = await admin.pedir('get', '/admin/panel').expect(200);
    await esperarCumpleContrato('get', '/admin/panel', respuesta);

    const { codigosEnviados } = respuesta.body as {
      codigosEnviados: {
        hoy: { entregados: number; conIngreso: number };
        ultimos7Dias: { entregados: number };
      };
    };
    expect(codigosEnviados.hoy.entregados).toBeGreaterThanOrEqual(8);
    expect(codigosEnviados.hoy.conIngreso).toBeGreaterThanOrEqual(1);
    expect(codigosEnviados.ultimos7Dias.entregados).toBeGreaterThanOrEqual(
      codigosEnviados.hoy.entregados,
    );
  });

  it('el código nunca aparece en la tabla, la lista, el CSV, el panel ni los registros', async () => {
    // Un código como valor suelto: no cuenta una racha de dígitos dentro de una huella o un uuid.
    const conCodigo = (texto: string) =>
      codigos.filter((c) => new RegExp(`(?<![0-9a-f])${c}(?![0-9a-f])`, 'i').test(texto));
    const tabla = await prisma.$queryRaw<{ fila: string }[]>`
      SELECT row_to_json(a)::text AS fila FROM seguridad.auditoria a WHERE accion = 'CODIGO_ENVIADO'`;
    const lista = await admin
      .pedir('get', '/admin/auditoria?accion=CODIGO_ENVIADO&porPagina=100')
      .expect(200);
    const csv = await admin
      .pedir('get', '/admin/auditoria?accion=CODIGO_ENVIADO&formato=csv')
      .expect(200);
    const panel = await admin.pedir('get', '/admin/panel').expect(200);

    expect(codigos.length).toBeGreaterThan(0);
    for (const fila of tabla) {
      expect(fila.fila).not.toMatch(/"codigo"/);
      expect(conCodigo(fila.fila)).toEqual([]);
    }
    expect(conCodigo(JSON.stringify(lista.body))).toEqual([]);
    expect(conCodigo(csv.text)).toEqual([]);
    expect(conCodigo(JSON.stringify(panel.body))).toEqual([]);
    expect(conCodigo(logger.lineas.join('\n'))).toEqual([]);
    expect(csv.text.split('\r\n')[0]).toMatch(/;resultado;desenlace$/);
  });

  describe('con el medio de envío caído', () => {
    let appCaida: INestApplication<App>;

    beforeAll(async () => {
      const caido: EnviadorOTP = {
        canal: 'SIMULADO',
        enviar: () => Promise.reject(new Error('el medio no responde')),
      };
      ({ app: appCaida } = (await crearAplicacionDePrueba({
        ajustar: (modulo) => modulo.overrideProvider(ENVIADOR_OTP).useValue(caido),
      })) as { app: INestApplication<App> });
    });

    afterAll(async () => {
      await appCaida.close();
    });

    it('registra CODIGO_ENVIADO con resultado fallido y responde el mensaje de siempre', async () => {
      const persona = await crearUsuarioDePrueba(prisma);

      const respuesta = await request(appCaida.getHttpServer())
        .post('/api/v1/auth/iniciar-sesion')
        .set('X-Forwarded-For', '10.7.3.1')
        .send({ correo: persona.correo, clave: persona.clave });

      expect(respuesta.status).toBe(503);
      const [fila] = await filas({ afectado_usuario_id: persona.id, accion: 'CODIGO_ENVIADO' });
      expect(fila).toMatchObject({ resultado: 'RECHAZADO', detalle: { entrega: 'FALLIDO' } });
      const [evento] = await eventosDeLaCuenta(persona.id);
      expect(evento?.codigoEnviado?.desenlace).toBe('ENVIO_FALLIDO');
    });
  });
});
