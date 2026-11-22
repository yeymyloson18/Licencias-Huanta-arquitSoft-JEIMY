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
import { limpiarPagos, llevarAEstado, sembrarEsquela } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';
import { limpiar006, sembrarLicencia } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// SC-004 de la 007 (FR-012, principio VII): el tablero, el reporte de licencias (JSON y CSV), sus
// errores, las claves y los valores de la caché rep:*, los registros del servidor y las URL no llevan
// documento, RUC, celular, correo, dirección ni nombre completo del titular. Datos FICTICIOS.

interface Intercambio {
  readonly url: string;
  readonly respuesta: Response;
}

const PERSONALES = [
  TITULAR_DE_PRUEBA.documento,
  TITULAR_DE_PRUEBA.ruc,
  TITULAR_DE_PRUEBA.celular,
  TITULAR_DE_PRUEBA.correo,
  TITULAR_DE_PRUEBA.direccion,
  TITULAR_DE_PRUEBA.nombre,
];

const filtrados = (texto: string) => PERSONALES.filter((valor) => texto.includes(valor));

const hoyLima = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

describe('Privacidad del tablero y los reportes (SC-004 de la 007)', () => {
  let app: INestApplication<App>;
  let logger: LoggerCapturador;
  let redis: Redis;
  let prisma: PrismaServicio;
  let jefatura: ClienteConSesion;
  let caja: ClienteConSesion;
  const intercambios: Intercambio[] = [];

  const pedir = async (ruta: string, token: string | null) => {
    const url = `/api/v1${ruta}`;
    let prueba = request(app.getHttpServer()).get(url).set('X-Forwarded-For', '198.51.100.97');
    if (token !== null) {
      prueba = prueba.set('Authorization', `Bearer ${token}`);
    }
    const respuesta = await prueba;
    intercambios.push({ url, respuesta });
    return respuesta;
  };

  const limpiarCache = async () => {
    for (const clave of await redis.keys('rep:*')) {
      await redis.del(clave);
    }
  };

  beforeAll(async () => {
    const creada = await crearAplicacionDePrueba();
    app = creada.app as INestApplication<App>;
    logger = creada.logger;
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    const protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    await limpiarCache();
    await limpiar006(prisma);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    jefatura = await clienteConRoles(app, prisma, redis, ['JEFATURA']);
    caja = await clienteConRoles(app, prisma, redis, ['CAJA']);

    // Un expediente con licencia vigente y certificado por vencer, otro en trámite y uno pagado.
    const conLicencia = (await sembrarExpediente(prisma, protector)).numero;
    await llevarAEstado(prisma, conLicencia, 'FINALIZADO');
    const licencia = await sembrarLicencia(prisma, conLicencia);
    const { id } = await prisma.licencia.findUniqueOrThrow({ where: { numero: licencia.numero } });
    const vence = new Date(`${hoyLima()}T00:00:00Z`);
    vence.setUTCDate(vence.getUTCDate() + 10);
    await prisma.certificado_itse.create({
      data: {
        licencia_id: id,
        numero: 'ITSE-PRIV-007',
        emitido_en: new Date('2025-01-10T00:00:00Z'),
        vence_en: vence,
      },
    });
    const enTramite = (await sembrarExpediente(prisma, protector, { codigoReceta: 'LIC-03' }))
      .numero;
    await llevarAEstado(prisma, enTramite, 'EN_EVALUACION');
    const pagado = (await sembrarExpediente(prisma, protector)).numero;
    await llevarAEstado(prisma, pagado, 'PAGADO');
    const codigo = await sembrarEsquela(prisma, pagado);
    await prisma.esquela.update({
      where: { codigo },
      data: { numero_recibo: 'REC-PRIV-1', pagada_en: new Date(), registrado_por: caja.usuario.id },
    });

    // Recorrido: tablero (con y sin rango, y con errores), reporte en JSON y CSV de las 3
    // situaciones, filtros, errores de validación y un rol sin permiso.
    await pedir('/reportes/tablero', jefatura.token);
    await pedir(`/reportes/tablero?desde=${hoyLima()}&hasta=${hoyLima()}`, jefatura.token);
    await pedir('/reportes/tablero?desde=2026-02-30&hasta=2026-03-01', jefatura.token);
    await pedir('/reportes/tablero?desde=2026-11-01', jefatura.token);
    for (const situacion of ['VIGENTES', 'EN_TRAMITE', 'ITSE_POR_VENCER']) {
      await pedir(`/reportes/licencias?situacion=${situacion}`, jefatura.token);
      await pedir(`/reportes/licencias?situacion=${situacion}&formato=csv`, jefatura.token);
    }
    await pedir('/reportes/licencias?situacion=VIGENTES&giro=bodega&zona=centro', jefatura.token);
    await pedir('/reportes/licencias?situacion=TODAS', jefatura.token);
    await pedir('/reportes/licencias?situacion=VIGENTES&codigoReceta=XYZ', jefatura.token);
    await pedir('/reportes/tablero', caja.token);
    await pedir('/reportes/licencias?situacion=VIGENTES', null);
  });

  afterAll(async () => {
    await limpiarCache();
    await limpiar006(prisma);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('el recorrido obtuvo datos y pasó por errores', () => {
    const estados = intercambios.map((i) => i.respuesta.status);

    expect(estados).toEqual(expect.arrayContaining([200, 401, 403, 422]));
    const enTramite = intercambios.find(
      (i) => i.url.endsWith('situacion=EN_TRAMITE') && i.respuesta.status === 200,
    );
    expect(enTramite?.respuesta.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ titular: 'Titular D. P. U.', estado: 'EN_EVALUACION' }),
        expect.objectContaining({ titular: 'Titular D. P. U.', estado: 'PAGADO' }),
      ]),
    );
  });

  it('ninguna respuesta (JSON, CSV, cabeceras ni errores) trae datos personales ni el nombre completo', () => {
    const contenido = intercambios
      .map(
        (i) =>
          `${JSON.stringify(i.respuesta.headers)}\n${JSON.stringify(i.respuesta.body)}\n${i.respuesta.text}`,
      )
      .join('\n');

    expect(filtrados(contenido)).toEqual([]);
  });

  it('el CSV solo lleva el titular público', () => {
    const csv = intercambios
      .filter((i) => i.url.includes('formato=csv'))
      .map((i) => i.respuesta.text)
      .join('\n');

    expect(csv).toContain('Titular D. P. U.');
    expect(filtrados(csv)).toEqual([]);
  });

  it('las claves y los valores de la caché no llevan datos personales', async () => {
    const claves = await redis.keys('rep:*');
    const valores = await Promise.all(claves.map((clave) => redis.get(clave)));

    expect(claves.length).toBeGreaterThan(0);
    expect(filtrados(`${claves.join('\n')}\n${valores.join('\n')}`)).toEqual([]);
    expect(claves.every((clave) => /^rep:(tablero|licencias):[A-Za-z0-9:_*-]+$/.test(clave))).toBe(
      true,
    );
  });

  it('ningún registro del servidor ni URL trae datos personales', () => {
    expect(filtrados(logger.lineas.join('\n'))).toEqual([]);
    expect(filtrados(intercambios.map((i) => i.url).join('\n'))).toEqual([]);
  });
});
