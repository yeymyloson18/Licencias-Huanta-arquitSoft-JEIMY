import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba, type LoggerCapturador } from '../apoyo/aplicacion-prueba';
import { limpiarPagos, procesarEventos, versionDe } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { textoDePdf } from '../apoyo/texto-pdf';

// SC-006 de la 005 (FR-018, FR-034, principio VII): recorre las operaciones de evaluación y pago y
// comprueba que el documento, el RUC, el celular, el correo y la dirección del titular no aparecen en
// registros, URL, errores, eventos, auditorías ni en el PDF. Datos FICTICIOS.

interface Intercambio {
  readonly metodo: string;
  readonly url: string;
  readonly respuesta: Response;
}

const PERSONALES = [
  TITULAR_DE_PRUEBA.documento,
  TITULAR_DE_PRUEBA.ruc,
  TITULAR_DE_PRUEBA.celular,
  TITULAR_DE_PRUEBA.correo,
  TITULAR_DE_PRUEBA.direccion,
];

const filtrados = (texto: string, valores: readonly string[] = PERSONALES) =>
  valores.filter((valor) => texto.includes(valor));

const comoTexto = (valor: unknown) =>
  JSON.stringify(valor, (_, dato: unknown) => (typeof dato === 'bigint' ? String(dato) : dato));

describe('Privacidad en evaluación y pago (SC-006 de la 005)', () => {
  let app: INestApplication<App>;
  let logger: LoggerCapturador;
  let redis: Redis;
  let prisma: PrismaServicio;
  let evaluador: ClienteConSesion;
  let caja: ClienteConSesion;
  let jefatura: ClienteConSesion;
  let mesa: ClienteConSesion;
  let pdf: Buffer = Buffer.alloc(0);
  const intercambios: Intercambio[] = [];

  const pedir = async (
    metodo: 'get' | 'post' | 'patch',
    ruta: string,
    opciones: { token?: string; cuerpo?: object; ifMatch?: number } = {},
  ): Promise<Response> => {
    const url = `/api/v1${ruta}`;
    let peticion = request(app.getHttpServer())
      [metodo](url)
      .set('X-Forwarded-For', '198.51.100.91');
    if (opciones.token !== undefined) {
      peticion = peticion.set('Authorization', `Bearer ${opciones.token}`);
    }
    if (opciones.ifMatch !== undefined) {
      peticion = peticion.set('If-Match', String(opciones.ifMatch));
    }
    const respuesta = await (opciones.cuerpo === undefined
      ? peticion
      : peticion.send(opciones.cuerpo));
    intercambios.push({ metodo, url, respuesta });
    return respuesta;
  };

  beforeAll(async () => {
    const creada = await crearAplicacionDePrueba();
    app = creada.app as INestApplication<App>;
    logger = creada.logger;
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    const protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
    for (const clave of await redis.keys('lim:consulta:*')) {
      await redis.del(clave);
    }
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
    caja = await clienteConRoles(app, prisma, redis, ['CAJA']);
    jefatura = await clienteConRoles(app, prisma, redis, ['JEFATURA']);
    mesa = await clienteConRoles(app, prisma, redis, ['MESA_PARTES']);

    const { numero } = await sembrarExpediente(prisma, protector);
    const otro = (await sembrarExpediente(prisma, protector)).numero;
    const ev = evaluador.token;

    // Evaluación, con errores de por medio (versión vieja, sin If-Match, transición inválida).
    await pedir('post', `/expedientes/${numero}/evaluacion`, { token: ev, ifMatch: 999 });
    await pedir('post', `/expedientes/${numero}/evaluacion`, { token: ev });
    await pedir('post', `/expedientes/${numero}/aprobar`, {
      token: ev,
      ifMatch: await versionDe(prisma, numero),
    });
    await pedir('post', `/expedientes/${numero}/evaluacion`, {
      token: ev,
      ifMatch: await versionDe(prisma, numero),
    });
    await pedir('get', `/expedientes/${numero}`, { token: ev });
    await pedir('post', `/expedientes/${numero}/riesgo`, {
      token: ev,
      ifMatch: await versionDe(prisma, numero),
      cuerpo: { codigoReceta: 'LIC-99' },
    });
    await pedir('post', `/expedientes/${numero}/riesgo`, {
      token: ev,
      ifMatch: await versionDe(prisma, numero),
    });

    // Observar y denegar el otro expediente; subsanar con datos inválidos.
    await pedir('post', `/expedientes/${otro}/evaluacion`, {
      token: ev,
      ifMatch: await versionDe(prisma, otro),
    });
    await pedir('post', `/expedientes/${otro}/observar`, {
      token: ev,
      ifMatch: await versionDe(prisma, otro),
      cuerpo: { descripcion: 'Falta el croquis de ubicación' },
    });
    await pedir('post', `/expedientes/${otro}/subsanar`, {
      token: mesa.token,
      cuerpo: {
        documentos: [{ requisitoId: 1, documentoId: '00000000-0000-4000-8000-000000000d01' }],
      },
    });
    await pedir('post', `/expedientes/${otro}/denegar`, {
      token: ev,
      ifMatch: await versionDe(prisma, otro),
      cuerpo: { motivo: 'corto' },
    });

    // Consulta pública (con el token de consulta) y la esquela.
    const consulta = await pedir('post', '/expedientes/consultar', {
      cuerpo: { numeroExpediente: numero, documento: TITULAR_DE_PRUEBA.documento },
    });
    const token = (consulta.body as { tokenConsulta?: { token: string } }).tokenConsulta?.token;
    await pedir('get', `/esquelas/ESQ-${numero}/pdf`, { token });
    await procesarEventos(app);
    const codigo = `ESQ-${numero}`;
    const descarga = await request(app.getHttpServer())
      .get(`/api/v1/esquelas/${codigo}/pdf`)
      .set('Authorization', `Bearer ${token ?? ''}`)
      .buffer(true)
      .parse((respuesta, listo) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => {
          listo(null, Buffer.concat(partes));
        });
      });
    pdf = descarga.body as Buffer;
    await pedir('post', '/expedientes/consultar', {
      cuerpo: { numeroExpediente: otro, documento: TITULAR_DE_PRUEBA.documento },
    });

    // Caja: consulta, titular, recibo inválido, pago y pago repetido.
    await pedir('get', `/esquelas/${codigo.toLowerCase()}`, { token: caja.token });
    await pedir('get', `/expedientes/${numero}/titular`, { token: caja.token });
    await pedir('post', `/esquelas/${codigo}/pago`, {
      token: caja.token,
      cuerpo: { numeroRecibo: 'x' },
    });
    await pedir('post', `/esquelas/${codigo}/pago`, {
      token: caja.token,
      cuerpo: { numeroRecibo: 'REC-5001' },
    });
    await pedir('post', `/esquelas/${codigo}/pago`, {
      token: caja.token,
      cuerpo: { numeroRecibo: 'REC-5002' },
    });
    await procesarEventos(app);

    // Jefatura: corrección (con error) y auditorías.
    await pedir('patch', `/esquelas/${codigo}/recibo`, {
      token: jefatura.token,
      cuerpo: { numeroRecibo: 'REC-5003' },
    });
    await pedir('patch', `/esquelas/${codigo}/recibo`, {
      token: jefatura.token,
      cuerpo: { numeroRecibo: 'REC-5003', motivo: 'El cajero digitó mal el número' },
    });
    await pedir('get', '/pagos/auditoria', { token: jefatura.token });
    await pedir('get', `/expedientes/${numero}/auditoria`, { token: jefatura.token });

    // Aprobación.
    await pedir('post', `/expedientes/${numero}/aprobar`, {
      token: ev,
      ifMatch: await versionDe(prisma, numero),
    });
  });

  afterAll(async () => {
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('el recorrido llegó al final (APROBADO) y pasó por errores', async () => {
    const estados = intercambios.map((i) => i.respuesta.status);

    expect(estados).toEqual(expect.arrayContaining([200, 201, 202, 409, 412, 422]));
    expect(
      (await prisma.expediente.findMany({ select: { estado: true } })).map((e) => e.estado).sort(),
    ).toEqual(['APROBADO', 'OBSERVADO']);
  });

  it('ningún registro del servidor ni URL trae datos personales', () => {
    expect(filtrados(logger.lineas.join('\n'))).toEqual([]);
    expect(filtrados(intercambios.map((i) => i.url).join('\n'))).toEqual([]);
  });

  it('ninguna respuesta (de éxito o de error) trae documento, RUC, celular ni correo', () => {
    const cuerpos = intercambios
      .map((i) => `${comoTexto(i.respuesta.headers)}\n${comoTexto(i.respuesta.body)}`)
      .join('\n');

    expect(filtrados(cuerpos, PERSONALES.slice(0, 4))).toEqual([]);
  });

  it('la dirección solo sale en el expediente del personal (detalle y decisiones exitosas)', () => {
    const conDireccion = intercambios.filter((i) =>
      comoTexto(i.respuesta.body).includes(TITULAR_DE_PRUEBA.direccion),
    );

    expect(conDireccion.length).toBeGreaterThan(0);
    for (const intercambio of conDireccion) {
      expect(intercambio.respuesta.status).toBe(200);
      expect(intercambio.url).toMatch(
        /^\/api\/v1\/expedientes\/EXP-\d{4}-\d{6}(\/(evaluacion|riesgo|observar|aprobar))?$/,
      );
    }
  });

  it('los eventos y las auditorías no guardan datos personales', async () => {
    const eventos = await prisma.evento_pendiente.findMany();
    const auditoriaTramites = await prisma.auditoriaTramites.findMany();
    const auditoriaPagos = await prisma.auditoriaPagos.findMany();
    const historial = await prisma.historial_estado.findMany();

    expect(eventos.length).toBeGreaterThan(0);
    expect(auditoriaPagos.length).toBe(2);
    expect(filtrados(comoTexto([eventos, auditoriaTramites, auditoriaPagos, historial]))).toEqual(
      [],
    );
  });

  it('el PDF de la esquela no trae datos personales del titular', () => {
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const texto = textoDePdf(pdf).toUpperCase();
    const enHex = (valor: string) => Buffer.from(valor, 'latin1').toString('hex').toUpperCase();

    for (const valor of [...PERSONALES, TITULAR_DE_PRUEBA.nombre]) {
      expect(texto).not.toContain(valor.toUpperCase());
      expect(texto).not.toContain(enHex(valor));
    }
  });
});
