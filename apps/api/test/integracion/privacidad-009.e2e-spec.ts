import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba, type LoggerCapturador } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { leerOtpSimulado, limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { crearUsuarioDePrueba, type UsuarioDePrueba } from '../apoyo/usuarios-prueba';

// Privacidad de la auditoría de seguridad (FR-013, SC-005 de la 009, principio VII): ni la tabla, ni
// la lista, ni el CSV, ni el panel, ni los registros del servidor llevan correo, celular, clave,
// código ni la IP en claro. La ficha devuelve el correo (dato de la persona para el administrador)
// pero el celular solo enmascarado. Datos FICTICIOS.

const IP = '203.0.113.77';
const CORREO_INEXISTENTE = 'privacidad.inexistente.009@ejemplo.pe';
const CELULAR_NUEVO = '911122009';
const CLAVE_TEMPORAL = 'ClaveTemporalPrivada2026';

describe('Privacidad de la auditoría de seguridad (009)', () => {
  let app: INestApplication<App>;
  let logger: LoggerCapturador;
  let prisma: PrismaServicio;
  let redis: Redis;
  let admin: ClienteConSesion;
  let persona: UsuarioDePrueba;
  let codigo = '';
  const inicio = new Date();

  const prohibidos = () => [
    persona.correo,
    persona.celular,
    persona.clave,
    CELULAR_NUEVO,
    CLAVE_TEMPORAL,
    CORREO_INEXISTENTE,
    codigo,
    IP,
  ];
  const encontrados = (texto: string, lista = prohibidos()) =>
    lista.filter((valor) => valor !== '' && texto.includes(valor));

  const intentar = (correo: string, clave: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/iniciar-sesion')
      .set('X-Forwarded-For', IP)
      .send({ correo, clave });

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
    persona = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });

    // Intentos fallidos, con un correo que no existe, y un ingreso correcto con su código.
    await intentar(persona.correo, 'ClaveEquivocada2026').expect(401);
    await intentar(CORREO_INEXISTENTE, 'Cualquiera2026').expect(401);
    const paso1 = await intentar(persona.correo, persona.clave).expect(200);
    codigo = await leerOtpSimulado(redis, persona.id);
    await request(app.getHttpServer())
      .post('/api/v1/auth/verificar-otp')
      .set('X-Forwarded-For', IP)
      .send({ desafioId: (paso1.body as { desafioId: string }).desafioId, codigo })
      .expect(200);

    // Gestión con datos personales en el cuerpo.
    await admin
      .pedir('patch', `/usuarios/${persona.id}`, {
        nombreCompleto: 'Persona Privada Corregida',
        celular: CELULAR_NUEVO,
      })
      .expect(200);
    await admin
      .pedir('post', `/usuarios/${persona.id}/clave-temporal`, { claveTemporal: CLAVE_TEMPORAL })
      .expect(204);
    await admin.pedir('post', `/usuarios/${persona.id}/desbloquear`).expect(204);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('la tabla seguridad.auditoria no guarda datos personales ni la IP', async () => {
    const filas = await prisma.$queryRaw<{ fila: string }[]>`
      SELECT row_to_json(a)::text AS fila FROM seguridad.auditoria a WHERE ocurrido_en >= ${inicio}`;

    expect(filas.length).toBeGreaterThanOrEqual(6);
    expect(encontrados(filas.map((f) => f.fila).join('\n'))).toEqual([]);
  });

  it('la lista, el CSV y el panel no los muestran', async () => {
    const lista = await admin.pedir('get', `/admin/auditoria?afectadoId=${persona.id}`).expect(200);
    const csv = await admin.pedir('get', '/admin/auditoria?formato=csv').expect(200);
    const panel = await admin.pedir('get', '/admin/panel').expect(200);

    expect(encontrados(JSON.stringify(lista.body))).toEqual([]);
    expect(encontrados(csv.text)).toEqual([]);
    expect(encontrados(JSON.stringify(panel.body))).toEqual([]);
  });

  it('la ficha trae el correo pero no el celular completo, la clave, el código ni la IP', async () => {
    const ficha = await admin.pedir('get', `/usuarios/${persona.id}`).expect(200);
    const texto = JSON.stringify(ficha.body);

    expect(texto).toContain(persona.correo);
    expect(
      encontrados(texto, [
        persona.celular,
        CELULAR_NUEVO,
        persona.clave,
        CLAVE_TEMPORAL,
        codigo,
        IP,
      ]),
    ).toEqual([]);
  });

  it('los errores de la consulta no repiten lo recibido', async () => {
    const respuesta = await admin.pedir(
      'get',
      `/admin/auditoria?actorId=${encodeURIComponent(persona.correo)}`,
    );

    expect(respuesta.status).toBe(422);
    expect(encontrados(JSON.stringify(respuesta.body))).toEqual([]);
  });

  it('los registros del servidor no llevan datos personales', () => {
    expect(encontrados(logger.lineas.join('\n'))).toEqual([]);
  });
});
