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
import {
  type EstadoDePrueba,
  limpiarPagos,
  llevarAEstado,
  sembrarEsquela,
} from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { textoDePdf } from '../apoyo/texto-pdf';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 3 de la 005: el administrado descarga su esquela (FR-016 a FR-018). Datos FICTICIOS.

interface EstadoConsultado {
  readonly codigoEsquela?: string;
  readonly montoEsquela?: string;
  readonly esquelaPagada?: boolean;
  readonly tokenConsulta?: { readonly token: string; readonly expiraEn: number };
  readonly observacionesPendientes?: string[];
}

/** supertest no junta un cuerpo binario por defecto. */
const comoBinario = (
  respuesta: NodeJS.ReadableStream & { setEncoding(c: string): void },
  listo: (error: Error | null, cuerpo: Buffer) => void,
) => {
  const partes: Buffer[] = [];
  respuesta.on('data', (parte: Buffer) => partes.push(parte));
  respuesta.on('end', () => {
    listo(null, Buffer.concat(partes));
  });
};

describe('PDF de la esquela y consulta con datos de pago (historia 3 de la 005)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  const personal: Record<string, ClienteConSesion> = {};

  const limpiarContadores = async () => {
    const claves = await redis.keys('lim:consulta:*');
    if (claves.length > 0) {
      await redis.del(...claves);
    }
  };

  const consultar = async (numero: string) => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/expedientes/consultar')
      .set('X-Forwarded-For', '203.0.113.50')
      .send({ numeroExpediente: numero, documento: TITULAR_DE_PRUEBA.documento });
    expect(respuesta.status).toBe(200);
    await esperarCumpleContrato('post', '/expedientes/consultar', respuesta);
    return respuesta.body as EstadoConsultado;
  };

  const descargar = (codigo: string, token?: string) => {
    const pedido = request(app.getHttpServer())
      .get(`/api/v1/esquelas/${codigo}/pdf`)
      .buffer(true)
      .parse(comoBinario as unknown as Parameters<request.Test['parse']>[0]);
    return token === undefined ? pedido : pedido.set('Authorization', `Bearer ${token}`);
  };

  const enEstado = async (estado: EstadoDePrueba, conEsquela = true) => {
    const { numero } = await sembrarExpediente(prisma, protector);
    await llevarAEstado(prisma, numero, estado);
    const codigo = conEsquela ? await sembrarEsquela(prisma, numero) : `ESQ-${numero}`;
    return { numero, codigo };
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    for (const rol of ['EVALUADOR', 'CAJA', 'JEFATURA', 'MESA_PARTES'] as const) {
      personal[rol] = await clienteConRoles(app, prisma, redis, [rol]);
    }
  });

  beforeEach(async () => {
    await limpiarContadores();
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiarContadores();
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('la consulta de un PENDIENTE_PAGO trae la esquela y el token; con él, el PDF', async () => {
    const { numero, codigo } = await enEstado('PENDIENTE_PAGO');

    const estado = await consultar(numero);

    expect(estado).toMatchObject({
      codigoEsquela: codigo,
      montoEsquela: '177.10',
      esquelaPagada: false,
    });
    expect(estado.tokenConsulta?.expiraEn).toBe(900);

    const pdf = await descargar(codigo, estado.tokenConsulta?.token);

    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe(`attachment; filename="${codigo}.pdf"`);
    expect(pdf.headers['cache-control']).toBe('no-store');
    expect(pdf.headers['x-content-type-options']).toBe('nosniff');
    const cuerpo = pdf.body as Buffer;
    expect(cuerpo.subarray(0, 4).toString()).toBe('%PDF');
    const texto = textoDePdf(cuerpo).toUpperCase();
    const enHex = (t: string) => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
    expect(texto).toContain(enHex(codigo));
    for (const dato of [
      TITULAR_DE_PRUEBA.documento,
      TITULAR_DE_PRUEBA.direccion,
      TITULAR_DE_PRUEBA.nombre,
    ]) {
      expect(texto).not.toContain(enHex(dato));
      expect(texto).not.toContain(dato.toUpperCase());
    }
  });

  it('el token de otro expediente responde 403 y sin token 401', async () => {
    const primero = await enEstado('PENDIENTE_PAGO');
    const segundo = await enEstado('PENDIENTE_PAGO');
    const { tokenConsulta } = await consultar(primero.numero);

    expect((await descargar(segundo.codigo, tokenConsulta?.token)).status).toBe(403);
    expect((await descargar(segundo.codigo)).status).toBe(401);
    expect((await descargar(segundo.codigo, 'basura')).status).toBe(401);
  });

  it('antes de que se genere la esquela responde 202; luego, 200', async () => {
    const { numero, codigo } = await enEstado('PENDIENTE_PAGO', false);
    const estado = await consultar(numero);
    expect(estado.codigoEsquela).toBeUndefined();

    const antes = await descargar(codigo, estado.tokenConsulta?.token);
    expect(antes.status).toBe(202);

    await sembrarEsquela(prisma, numero);
    expect((await descargar(codigo, estado.tokenConsulta?.token)).status).toBe(200);
  });

  it.each([
    ['EVALUADOR', 200],
    ['CAJA', 200],
    ['JEFATURA', 200],
    ['MESA_PARTES', 403],
  ])('el personal con rol %s → %i', async (rol, esperado) => {
    const { codigo } = await enEstado('PAGADO');

    const respuesta = await descargar(codigo, personal[rol]?.token);

    expect(respuesta.status).toBe(esperado);
  });

  it('en otro estado la consulta no trae token; OBSERVADO trae las observaciones', async () => {
    const pagado = await enEstado('PAGADO');
    const observado = await enEstado('OBSERVADO', false);
    const expediente = await prisma.expediente.findUniqueOrThrow({
      where: { numero: observado.numero },
    });
    await prisma.observacion.create({
      data: {
        expediente_id: expediente.id,
        descripcion: 'Falta el croquis de ubicación',
        creada_por: personal.EVALUADOR?.usuario.id ?? '',
      },
    });

    const estadoPagado = await consultar(pagado.numero);
    const estadoObservado = await consultar(observado.numero);

    expect(estadoPagado.tokenConsulta).toBeUndefined();
    expect(estadoPagado).toMatchObject({ codigoEsquela: pagado.codigo, esquelaPagada: false });
    expect(estadoObservado.observacionesPendientes).toEqual(['Falta el croquis de ubicación']);
    expect(estadoObservado.tokenConsulta).toBeUndefined();
  });
});
