import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import type { Rol } from '../../src/modulos/seguridad/dominio/rol';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { llevarAEstado } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';
import { limpiar006, sembrarLicencia } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { textoDePdf } from '../apoyo/texto-pdf';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 1 de la 006: verificación pública del QR y descarga de la licencia. Datos FICTICIOS.

const PERSONALES = [
  TITULAR_DE_PRUEBA.documento,
  TITULAR_DE_PRUEBA.ruc,
  TITULAR_DE_PRUEBA.celular,
  TITULAR_DE_PRUEBA.correo,
  TITULAR_DE_PRUEBA.direccion,
];

/** supertest no junta un cuerpo binario por defecto. */
const comoBinario = (
  respuesta: NodeJS.ReadableStream,
  listo: (error: Error | null, cuerpo: Buffer) => void,
) => {
  const partes: Buffer[] = [];
  respuesta.on('data', (parte: Buffer) => partes.push(parte));
  respuesta.on('end', () => {
    listo(null, Buffer.concat(partes));
  });
};

describe('Verificación pública y descarga de la licencia (historia 1 de la 006)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  const personal = new Map<Rol, ClienteConSesion>();

  const limpiarContadores = async () => {
    for (const patron of ['lim:verificacion:*', 'lim:consulta:*']) {
      const claves = await redis.keys(patron);
      if (claves.length > 0) {
        await redis.del(...claves);
      }
    }
  };

  const verificar = (codigo: string, origen = '203.0.113.60') =>
    request(app.getHttpServer())
      .get(`/api/v1/licencias/verificar/${codigo}`)
      .set('X-Forwarded-For', origen);

  const conLicencia = async (
    estado: 'ITSE_POSTERIOR_PENDIENTE' | 'LICENCIA_PROVISIONAL' = 'ITSE_POSTERIOR_PENDIENTE',
  ) => {
    const { numero } = await sembrarExpediente(prisma, protector);
    await llevarAEstado(prisma, numero, estado);
    const { codigoVerificacion } = await sembrarLicencia(prisma, numero);
    return { numero, codigoVerificacion };
  };

  const consultar = async (numero: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/expedientes/consultar')
      .set('X-Forwarded-For', '203.0.113.61')
      .send({ numeroExpediente: numero, documento: TITULAR_DE_PRUEBA.documento });
    expect(respuesta.status).toBe(200);
    await esperarCumpleContrato('post', '/expedientes/consultar', respuesta);
    return respuesta.body as { numeroLicencia: string | null; tokenConsulta?: { token: string } };
  };

  const descargar = (numeroLicencia: string, token?: string) => {
    const pedido = request(app.getHttpServer())
      .get(`/api/v1/licencias/${numeroLicencia}/pdf`)
      .buffer(true)
      .parse(comoBinario as unknown as Parameters<request.Test['parse']>[0]);
    return token === undefined ? pedido : pedido.set('Authorization', `Bearer ${token}`);
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    for (const rol of ['MESA_PARTES', 'EVALUADOR', 'JEFATURA', 'CAJA'] as const) {
      personal.set(rol, await clienteConRoles(app, prisma, redis, [rol]));
    }
  });

  beforeEach(async () => {
    await limpiarContadores();
    await limpiar006(prisma);
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiarContadores();
    await limpiar006(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('la verificación pública muestra solo los datos mínimos', async () => {
    const { numero, codigoVerificacion } = await conLicencia();

    const respuesta = await verificar(codigoVerificacion);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('get', '/licencias/verificar/{codigoVerificacion}', respuesta);
    expect(respuesta.body).toMatchObject({
      tipo: 'DEFINITIVA',
      estado: 'VIGENTE',
      titular: 'Titular D. P. U.',
      giro: 'Bodega',
      zona: 'Centro',
      itseEstado: 'SIN_CERTIFICADO',
    });
    const texto = JSON.stringify(respuesta.body);
    expect(texto).not.toContain(numero);
    expect(PERSONALES.filter((dato) => texto.includes(dato))).toEqual([]);
  });

  it('una licencia provisional vencida se muestra VENCIDA', async () => {
    const { numero } = await sembrarExpediente(prisma, protector);
    const { codigoVerificacion } = await sembrarLicencia(prisma, numero, {
      tipo: 'PROVISIONAL',
      vigenteHasta: new Date('2026-01-01T00:00:00Z'),
    });

    expect((await verificar(codigoVerificacion)).body).toMatchObject({ estado: 'VENCIDA' });
  });

  it('inexistente y mal formado responden el mismo 404; con 10 fallos, 429', async () => {
    const { codigoVerificacion } = await conLicencia();
    const inexistente = await verificar('A'.repeat(22));
    const malFormado = await verificar('otra-cosa');

    expect(inexistente.status).toBe(404);
    expect(malFormado.status).toBe(404);
    expect(malFormado.body).toEqual(inexistente.body);
    await esperarCumpleContrato('get', '/licencias/verificar/{codigoVerificacion}', inexistente);

    for (let i = 0; i < 8; i += 1) {
      await verificar('B'.repeat(22));
    }
    const bloqueado = await verificar(codigoVerificacion);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.headers['retry-after']).toBeDefined();
    expect((await verificar(codigoVerificacion, '203.0.113.99')).status).toBe(200);
  });

  it('la consulta trae el número y el token; con él, el PDF sin datos personales', async () => {
    const { numero, codigoVerificacion } = await conLicencia();
    const licencia = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: numero },
    });

    const estado = await consultar(numero);

    expect(estado.numeroLicencia).toBe(licencia.numero);
    const pdf = await descargar(licencia.numero, estado.tokenConsulta?.token);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe(
      `attachment; filename="${licencia.numero}.pdf"`,
    );
    expect(pdf.headers['cache-control']).toBe('no-store');
    expect(pdf.headers['x-content-type-options']).toBe('nosniff');
    const cuerpo = pdf.body as Buffer;
    expect(cuerpo.subarray(0, 4).toString()).toBe('%PDF');
    const texto = textoDePdf(cuerpo).toUpperCase();
    const enHex = (t: string) => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
    expect(texto).toContain(enHex(licencia.numero));
    expect(texto).toContain(enHex(`/verificar/${codigoVerificacion}`));
    for (const dato of PERSONALES) {
      expect(texto).not.toContain(enHex(dato));
    }
  });

  it('el token de otro expediente → 403; sin token → 401; inexistente → 404', async () => {
    const primero = await conLicencia();
    const segundo = await conLicencia();
    const licencia = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: segundo.numero },
    });
    const { tokenConsulta } = await consultar(primero.numero);

    expect((await descargar(licencia.numero, tokenConsulta?.token)).status).toBe(403);
    expect((await descargar(licencia.numero)).status).toBe(401);
    expect((await descargar('LF-2026-999999', tokenConsulta?.token)).status).toBe(404);
  });

  it.each([
    ['MESA_PARTES', 200],
    ['EVALUADOR', 200],
    ['JEFATURA', 200],
    ['CAJA', 403],
  ] as const)('el personal con rol %s ve la licencia → %i', async (rol, esperado) => {
    const { numero } = await conLicencia();
    const licencia = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: numero },
    });
    const cliente = personal.get(rol) as ClienteConSesion;

    const detalle = await cliente.pedir('get', `/licencias/${licencia.numero}`);

    expect(detalle.status).toBe(esperado);
    if (esperado === 200) {
      await esperarCumpleContrato('get', '/licencias/{numeroLicencia}', detalle);
      expect(detalle.body).toMatchObject({ numeroExpediente: numero, numero: licencia.numero });
      expect((await descargar(licencia.numero, cliente.token)).status).toBe(200);
    }
  });

  it('el detalle del expediente del personal trae el número de licencia', async () => {
    const { numero } = await conLicencia();
    const licencia = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: numero },
    });

    const detalle = await (personal.get('JEFATURA') as ClienteConSesion).pedir(
      'get',
      `/expedientes/${numero}`,
    );

    expect((detalle.body as { numeroLicencia: string }).numeroLicencia).toBe(licencia.numero);
  });
});
