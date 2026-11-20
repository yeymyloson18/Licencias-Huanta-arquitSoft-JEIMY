import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba, type LoggerCapturador } from '../apoyo/aplicacion-prueba';
import { limpiarTramites } from '../apoyo/expedientes-prueba';
import {
  PDF_PRUEBA,
  REPRESENTANTE_PRUEBA,
  TITULAR_EXTRANJERO,
  TITULAR_PRUEBA_1,
} from '../apoyo/identidad-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { leerOtpSimulado, limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// SC-005 de la 004 (FR-033 a FR-035, principio VII): recorre todas las operaciones de Trámites y
// comprueba que los documentos, RUC, celulares, correos y direcciones de prueba no aparecen en
// ningún registro, URL, cabecera, error, evento ni fila de auditoría. Datos FICTICIOS.
//
// Las respuestas 2xx pueden mostrar lo que existen para mostrar: el detalle del personal trae la
// dirección (no el documento, que va enmascarado). Ninguna 2xx trae documento, RUC ni celular.

interface Intercambio {
  readonly metodo: string;
  readonly url: string;
  readonly respuesta: Response;
}

const CORREO = 'titular.privacidad@ejemplo.pe';
const DIRECCION = 'Jr. Privacidad 777, Huanta';
const DIRECCION_PRESENCIAL = 'Av. Reservada 555, Huanta';

/** Valores que nunca deben filtrarse. */
const IDENTIFICADORES = [
  TITULAR_PRUEBA_1.numeroDocumento,
  TITULAR_PRUEBA_1.ruc,
  TITULAR_PRUEBA_1.celular,
  TITULAR_EXTRANJERO.numeroDocumento,
  TITULAR_EXTRANJERO.ruc,
  TITULAR_EXTRANJERO.celular,
  REPRESENTANTE_PRUEBA.numeroDocumento,
];
const TODOS = [...IDENTIFICADORES, CORREO, DIRECCION, DIRECCION_PRESENCIAL];

const filtrados = (texto: string, valores: readonly string[]) =>
  valores.filter((valor) => texto.includes(valor));

describe('Privacidad en Trámites (SC-005 de la 004)', () => {
  let app: INestApplication<App>;
  let logger: LoggerCapturador;
  let redis: Redis;
  let prisma: PrismaServicio;
  let mesa: ClienteConSesion;
  let evaluador: ClienteConSesion;
  let requisitosSiempre: number[];
  const intercambios: Intercambio[] = [];

  const pedir = async (
    metodo: 'get' | 'post',
    ruta: string,
    opciones: { token?: string; cuerpo?: object; archivo?: boolean; clave?: boolean } = {},
  ): Promise<Response> => {
    const url = `/api/v1${ruta}`;
    let peticion = request(app.getHttpServer())
      [metodo](url)
      .set('X-Forwarded-For', '198.51.100.90');
    if (opciones.token !== undefined) {
      peticion = peticion.set('Authorization', `Bearer ${opciones.token}`);
    }
    if (opciones.clave === true) {
      peticion = peticion.set('Idempotency-Key', randomUUID());
    }
    const respuesta = await (opciones.archivo === true
      ? peticion.attach('archivo', PDF_PRUEBA, 'solicitud.pdf')
      : opciones.cuerpo === undefined
        ? peticion
        : peticion.send(opciones.cuerpo));
    intercambios.push({ metodo, url, respuesta });
    return respuesta;
  };

  const subirVarios = async (token: string) => {
    const documentos = [];
    for (const requisitoId of requisitosSiempre) {
      const subida = await pedir('post', '/documentos', { token, archivo: true });
      documentos.push({
        requisitoId,
        documentoId: (subida.body as { documentoId: string }).documentoId,
      });
    }
    return documentos;
  };

  const cuerpoSolicitud = (identidad: object, direccion: string, documentos: object[]) => ({
    codigoReceta: 'LIC-02',
    identidad,
    nombreTitular: 'Titular de Prueba',
    correo: CORREO,
    giro: 'Bodega',
    direccion,
    zona: 'Centro',
    areaM2: 40,
    documentos,
  });

  beforeAll(async () => {
    const creada = await crearAplicacionDePrueba();
    app = creada.app as INestApplication<App>;
    logger = creada.logger;
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
    mesa = await clienteConRoles(app, prisma, redis, ['MESA_PARTES']);
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
    const ficha = await request(app.getHttpServer()).get('/api/v1/catalogo/recetas/LIC-02');
    requisitosSiempre = (
      ficha.body as { requisitos: { id: number; condicion: string }[] }
    ).requisitos
      .filter((requisito) => requisito.condicion === 'SIEMPRE')
      .map((requisito) => requisito.id);

    // 1. En línea: identidad que no coincide, formato inválido, identidad correcta y código.
    await pedir('post', '/identidad/verificar', {
      cuerpo: { ...TITULAR_PRUEBA_1, fechaEmision: '2020-01-16' },
    });
    await pedir('post', '/identidad/verificar', { cuerpo: { ...TITULAR_PRUEBA_1, ruc: '123' } });
    await pedir('post', '/identidad/verificar', {
      cuerpo: {
        ...TITULAR_PRUEBA_1,
        representante: { ...REPRESENTANTE_PRUEBA, fechaEmision: '2019-05-11' },
      },
    });
    const desafio = await pedir('post', '/identidad/verificar', { cuerpo: TITULAR_PRUEBA_1 });
    const desafioId = (desafio.body as { desafioId: string }).desafioId;
    await pedir('post', '/identidad/verificar-otp', { cuerpo: { desafioId, codigo: '000000' } });
    const codigo = await leerOtpSimulado(redis, desafioId);
    const otp = await pedir('post', '/identidad/verificar-otp', { cuerpo: { desafioId, codigo } });
    const tokenIdentidad = (otp.body as { token: string }).token;

    // 2. Subida y presentación en línea (con un intento rechazado por identidad distinta).
    const documentos = await subirVarios(tokenIdentidad);
    await pedir('post', '/expedientes', {
      token: tokenIdentidad,
      clave: true,
      cuerpo: cuerpoSolicitud({ ...TITULAR_PRUEBA_1, celular: '987000009' }, DIRECCION, documentos),
    });
    const enLinea = await pedir('post', '/expedientes', {
      token: tokenIdentidad,
      clave: true,
      cuerpo: cuerpoSolicitud(TITULAR_PRUEBA_1, DIRECCION, documentos),
    });
    const numero = (enLinea.body as { numero: string }).numero;

    // 3. Mesa de partes: una identidad que no coincide y un registro correcto.
    const documentosMesa = await subirVarios(mesa.token);
    await pedir('post', '/expedientes', {
      token: mesa.token,
      clave: true,
      cuerpo: cuerpoSolicitud(
        { ...TITULAR_EXTRANJERO, ruc: '15000123457' },
        DIRECCION_PRESENCIAL,
        documentosMesa,
      ),
    });
    await pedir('post', '/expedientes', {
      token: mesa.token,
      clave: true,
      cuerpo: cuerpoSolicitud(TITULAR_EXTRANJERO, DIRECCION_PRESENCIAL, documentosMesa),
    });

    // 4. Consulta pública: correcta, fallida y con formato inválido.
    await pedir('post', '/expedientes/consultar', {
      cuerpo: { numeroExpediente: numero, documento: TITULAR_PRUEBA_1.numeroDocumento },
    });
    await pedir('post', '/expedientes/consultar', {
      cuerpo: { numeroExpediente: numero, documento: TITULAR_EXTRANJERO.ruc },
    });
    await pedir('post', '/expedientes/consultar', {
      cuerpo: { numeroExpediente: 'EXP-1', documento: `${TITULAR_PRUEBA_1.ruc}-x` },
    });

    // 5. Bandeja, detalle, descarga y un detalle inexistente.
    await pedir('get', '/expedientes?estado=REGISTRADO', { token: evaluador.token });
    const detalle = await pedir('get', `/expedientes/${numero}`, { token: evaluador.token });
    const documentoId = (detalle.body as { documentos: { id: string }[] }).documentos[0]?.id ?? '';
    await pedir('get', `/expedientes/${numero}/documentos/${documentoId}`, {
      token: evaluador.token,
    });
    await pedir('get', '/expedientes/EXP-2026-999999', { token: evaluador.token });
  }, 120_000);

  afterAll(async () => {
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('el recorrido cubrió éxitos y rechazos de cada operación', () => {
    const estados = new Set(intercambios.map((i) => `${i.metodo} ${i.respuesta.status}`));
    for (const esperado of [
      'post 200',
      'post 201',
      'post 422',
      'post 401',
      'post 403',
      'post 404',
      'get 200',
      'get 404',
    ]) {
      expect(estados).toContain(esperado);
    }
  });

  it('ninguna línea del registro contiene datos personales', () => {
    const texto = logger.lineas.join('\n');

    expect(filtrados(texto, TODOS)).toEqual([]);
  });

  it('ninguna URL contiene datos personales', () => {
    const urls = intercambios.map((intercambio) => intercambio.url).join('\n');

    expect(filtrados(urls, TODOS)).toEqual([]);
  });

  it('ninguna cabecera de respuesta contiene datos personales', () => {
    const cabeceras = intercambios.map((i) => JSON.stringify(i.respuesta.headers)).join('\n');

    expect(filtrados(cabeceras, TODOS)).toEqual([]);
  });

  it('ningún error repite datos personales', () => {
    const errores = intercambios
      .filter((intercambio) => intercambio.respuesta.status >= 400)
      .map((intercambio) => JSON.stringify(intercambio.respuesta.body))
      .join('\n');

    expect(errores).not.toBe('');
    expect(filtrados(errores, TODOS)).toEqual([]);
  });

  it('ninguna respuesta exitosa trae documento, RUC ni celular, y el correo nunca sale', () => {
    const exitosas = intercambios
      .filter((i) => i.respuesta.status < 300 && !i.url.includes('/documentos/'))
      .map((i) => JSON.stringify(i.respuesta.body))
      .join('\n');

    expect(filtrados(exitosas, [...IDENTIFICADORES, CORREO])).toEqual([]);
  });

  it('solo el detalle del personal muestra la dirección', () => {
    const conDireccion = intercambios.filter((i) =>
      JSON.stringify(i.respuesta.body ?? '').includes(DIRECCION),
    );

    expect(conDireccion.map((i) => `${i.metodo} ${i.url}`)).toEqual([
      expect.stringMatching(/^get \/api\/v1\/expedientes\/EXP-\d{4}-\d{6}$/),
    ]);
  });

  it('los eventos y la auditoría no guardan datos personales', async () => {
    const eventos = await prisma.evento_pendiente.findMany();
    const auditoria = await prisma.auditoriaTramites.findMany();

    expect(eventos.length).toBeGreaterThan(0);
    expect(auditoria.length).toBeGreaterThan(0);
    expect(
      filtrados(
        JSON.stringify(eventos, (_, valor: unknown) =>
          typeof valor === 'bigint' ? String(valor) : valor,
        ),
        TODOS,
      ),
    ).toEqual([]);
    expect(
      filtrados(
        JSON.stringify(auditoria, (_, valor: unknown) =>
          typeof valor === 'bigint' ? String(valor) : valor,
        ),
        TODOS,
      ),
    ).toEqual([]);
  });

  it('en la base los datos personales del expediente quedan cifrados', async () => {
    const filas = await prisma.expediente.findMany();
    const enBruto = filas
      .map((fila) =>
        [fila.documento_cifrado, fila.ruc_cifrado, fila.celular_cifrado, fila.direccion_cifrada]
          .map((bytes) => Buffer.from(bytes).toString('latin1'))
          .join('|'),
      )
      .join('\n');

    expect(filas).toHaveLength(2);
    expect(filtrados(enBruto, TODOS)).toEqual([]);
  });
});
