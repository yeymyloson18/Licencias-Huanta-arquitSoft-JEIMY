import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { llevarAEstado } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { limpiar006, sembrarLicencia } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 2 de la 007: reporte de licencias en JSON y CSV. Datos FICTICIOS.

const hoyLima = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const dentroDe = (dias: number) => {
  const fecha = new Date(`${hoyLima()}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha;
};

interface Fila {
  numero: string;
  codigoReceta: string;
  titular: string;
  giro: string;
  zona: string;
  estado: string;
  fecha: string;
}

describe('Reporte de licencias (historia 2 de la 007)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let jefatura: ClienteConSesion;
  let caja: ClienteConSesion;
  const licencias: string[] = [];
  const enTramite: string[] = [];

  const limpiarCache = async () => {
    for (const clave of await redis.keys('rep:*')) {
      await redis.del(clave);
    }
  };

  const conLicencia = async (giro: string, zona: string, venceItse?: number) => {
    const { numero } = await sembrarExpediente(prisma, protector);
    await llevarAEstado(prisma, numero, 'FINALIZADO');
    const licencia = await sembrarLicencia(prisma, numero);
    await prisma.licencia.update({ where: { numero: licencia.numero }, data: { giro, zona } });
    if (venceItse !== undefined) {
      const { id } = await prisma.licencia.findUniqueOrThrow({
        where: { numero: licencia.numero },
      });
      await prisma.certificado_itse.create({
        data: {
          licencia_id: id,
          numero: `ITSE-REP-${licencia.numero.slice(-6)}`,
          emitido_en: dentroDe(-700),
          vence_en: dentroDe(venceItse),
        },
      });
    }
    licencias.push(licencia.numero);
    return licencia.numero;
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    await limpiar006(prisma);
    await limpiarTramites(prisma);
    jefatura = await clienteConRoles(app, prisma, redis, ['JEFATURA']);
    caja = await clienteConRoles(app, prisma, redis, ['CAJA']);

    await conLicencia('Bodega', 'Centro', 20);
    await conLicencia('BÓDEGA', 'Pampa Ñahuín', 5);
    await conLicencia('Farmacia; botica', 'Centro', 200);
    await conLicencia('=Giro raro', 'Centro');
    for (const estado of ['EN_EVALUACION', 'PAGADO', 'FINALIZADO', 'DENEGADO'] as const) {
      const { numero } = await sembrarExpediente(prisma, protector, { codigoReceta: 'LIC-03' });
      await llevarAEstado(prisma, numero, estado);
      if (estado === 'EN_EVALUACION' || estado === 'PAGADO') {
        enTramite.push(numero);
      }
    }
  });

  beforeEach(async () => {
    await limpiarCache();
  });

  afterAll(async () => {
    await limpiarCache();
    await prisma.$executeRaw`DELETE FROM licencias.licencia WHERE numero LIKE 'LF-2025-%'`;
    await limpiar006(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('vigentes por giro sin mayúsculas ni tildes, con el titular público', async () => {
    const respuesta = await jefatura.pedir(
      'get',
      '/reportes/licencias?situacion=VIGENTES&giro=bodega',
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    expect(respuesta.headers['x-reporte-truncado']).toBe('false');
    await esperarCumpleContrato('get', '/reportes/licencias', respuesta);
    const filas = respuesta.body as Fila[];
    expect(filas.map((f) => f.numero)).toEqual(licencias.slice(0, 2));
    expect(filas[0]).toMatchObject({
      codigoReceta: 'LIC-02',
      titular: 'Titular D. P. U.',
      estado: 'VIGENTE',
      fecha: hoyLima(),
    });
    const conZona = await jefatura.pedir(
      'get',
      `/reportes/licencias?situacion=VIGENTES&giro=bodega&zona=${encodeURIComponent('pampa nahuin')}`,
    );
    expect((conZona.body as Fila[]).map((f) => f.numero)).toEqual([licencias[1]]);
  });

  it('en trámite: los expedientes sin decisión final, del más antiguo al más nuevo', async () => {
    const respuesta = await jefatura.pedir(
      'get',
      '/reportes/licencias?situacion=EN_TRAMITE&codigoReceta=LIC-03',
    );

    await esperarCumpleContrato('get', '/reportes/licencias', respuesta);
    expect((respuesta.body as Fila[]).map((f) => [f.numero, f.estado])).toEqual([
      [enTramite[0], 'EN_EVALUACION'],
      [enTramite[1], 'PAGADO'],
    ]);
  });

  it('ITSE por vencer en 30 días o menos, del más cercano al más lejano', async () => {
    const respuesta = await jefatura.pedir('get', '/reportes/licencias?situacion=ITSE_POR_VENCER');

    await esperarCumpleContrato('get', '/reportes/licencias', respuesta);
    const filas = respuesta.body as Fila[];
    expect(filas.map((f) => f.numero)).toEqual([licencias[1], licencias[0]]);
    expect(filas[0]?.fecha).toBe(dentroDe(5).toISOString().slice(0, 10));
  });

  it('CSV con BOM, punto y coma, CRLF, escape y las mismas filas que el JSON', async () => {
    const json = await jefatura.pedir('get', '/reportes/licencias?situacion=VIGENTES');
    const csv = await jefatura.pedir('get', '/reportes/licencias?situacion=VIGENTES&formato=csv');

    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(csv.headers['content-disposition']).toBe(
      `attachment; filename="reporte-vigentes-${hoyLima()}.csv"`,
    );
    expect(csv.headers['x-reporte-truncado']).toBe('false');
    const lineas = csv.text.split('\r\n');
    expect(lineas[0]).toBe('﻿numero;codigoReceta;titular;giro;zona;estado;fecha');
    expect(lineas.slice(1, -1)).toHaveLength((json.body as Fila[]).length);
    expect(csv.text).toContain('"Farmacia; botica"');
    expect(csv.text).toContain(";'=Giro raro;");
    expect(csv.text).toContain('Pampa Ñahuín');
  });

  it('más de 5,000 filas: devuelve 5,000 y avisa con X-Reporte-Truncado', async () => {
    await prisma.$executeRaw`
      INSERT INTO licencias.licencia
        (numero, numero_expediente, codigo_receta, tipo, giro, zona, titular_publico, codigo_verificacion)
      SELECT 'LF-2025-' || lpad(g::text, 6, '0'), 'EXP-2025-' || lpad(g::text, 6, '0'), 'LIC-01',
             'DEFINITIVA', 'Masivo', 'Zona masiva', 'Titular M.', substr(md5(g::text), 1, 22)
        FROM generate_series(1, 5001) g`;

    const respuesta = await jefatura.pedir(
      'get',
      '/reportes/licencias?situacion=VIGENTES&codigoReceta=LIC-01',
    );

    expect(respuesta.headers['x-reporte-truncado']).toBe('true');
    expect(respuesta.body).toHaveLength(5000);
  });

  it.each([
    ['sin situación', ''],
    ['situación inválida', '?situacion=TODAS'],
    ['licencia inválida', '?situacion=VIGENTES&codigoReceta=XYZ'],
    ['giro muy largo', `?situacion=VIGENTES&giro=${'a'.repeat(151)}`],
    ['formato inválido', '?situacion=VIGENTES&formato=xlsx'],
  ])('%s → 422', async (_, consulta) => {
    const respuesta = await jefatura.pedir('get', `/reportes/licencias${consulta}`);

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('get', '/reportes/licencias', respuesta);
  });

  it('otro rol → 403 y sin sesión → 401', async () => {
    expect((await caja.pedir('get', '/reportes/licencias?situacion=VIGENTES')).status).toBe(403);
    const sinSesion = await jefatura
      .pedir('get', '/reportes/licencias?situacion=VIGENTES')
      .set('Authorization', '');
    expect(sinSesion.status).toBe(401);
  });
});
