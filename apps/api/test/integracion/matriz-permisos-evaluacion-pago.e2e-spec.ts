import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { ROLES, type Rol } from '../../src/modulos/seguridad/dominio/rol';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarPagos, llevarAEstado, sembrarEsquela } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// Matriz de permisos de la 005 (SC-007): cada endpoint nuevo responde 401 sin sesión y 403 a cada rol
// que no corresponde, sin cambiar datos. Datos FICTICIOS.

interface Operacion {
  readonly metodo: 'get' | 'post' | 'patch';
  readonly ruta: () => string;
  readonly cuerpo?: object;
  readonly ifMatch?: boolean;
  readonly roles: readonly Rol[];
}

describe('Matriz de permisos de evaluación y pago (SC-007 de la 005)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let numero: string;
  let codigo: string;
  const clientes = new Map<Rol, ClienteConSesion>();

  const OPERACIONES: Record<string, Operacion> = {
    iniciarEvaluacion: {
      metodo: 'post',
      ruta: () => `/expedientes/${numero}/evaluacion`,
      ifMatch: true,
      roles: ['EVALUADOR'],
    },
    confirmarRiesgo: {
      metodo: 'post',
      ruta: () => `/expedientes/${numero}/riesgo`,
      ifMatch: true,
      roles: ['EVALUADOR'],
    },
    observar: {
      metodo: 'post',
      ruta: () => `/expedientes/${numero}/observar`,
      cuerpo: { descripcion: 'Falta el croquis de ubicación' },
      ifMatch: true,
      roles: ['EVALUADOR'],
    },
    denegar: {
      metodo: 'post',
      ruta: () => `/expedientes/${numero}/denegar`,
      cuerpo: { motivo: 'El giro no está permitido en la zona' },
      ifMatch: true,
      roles: ['EVALUADOR'],
    },
    aprobar: {
      metodo: 'post',
      ruta: () => `/expedientes/${numero}/aprobar`,
      ifMatch: true,
      roles: ['EVALUADOR'],
    },
    titularParaCaja: {
      metodo: 'get',
      ruta: () => `/expedientes/${numero}/titular`,
      roles: ['CAJA', 'JEFATURA'],
    },
    auditoriaExpediente: {
      metodo: 'get',
      ruta: () => `/expedientes/${numero}/auditoria`,
      roles: ['JEFATURA'],
    },
    consultarEsquela: { metodo: 'get', ruta: () => `/esquelas/${codigo}`, roles: ['CAJA'] },
    registrarPago: {
      metodo: 'post',
      ruta: () => `/esquelas/${codigo}/pago`,
      cuerpo: { numeroRecibo: 'REC-7777' },
      roles: ['CAJA'],
    },
    descargarEsquela: {
      metodo: 'get',
      ruta: () => `/esquelas/${codigo}/pdf`,
      roles: ['EVALUADOR', 'CAJA', 'JEFATURA'],
    },
    corregirRecibo: {
      metodo: 'patch',
      ruta: () => `/esquelas/${codigo}/recibo`,
      cuerpo: { numeroRecibo: 'REC-7778', motivo: 'El cajero digitó mal el número' },
      roles: ['JEFATURA'],
    },
    auditoriaPagos: { metodo: 'get', ruta: () => '/pagos/auditoria', roles: ['JEFATURA'] },
    subsanar: {
      metodo: 'post',
      ruta: () => `/expedientes/${numero}/subsanar`,
      cuerpo: {
        documentos: [{ requisitoId: 1, documentoId: '00000000-0000-4000-8000-000000000d01' }],
      },
      roles: ['MESA_PARTES'],
    },
  };

  const operar = (operacion: Operacion, token: string | null) => {
    let prueba = request(app.getHttpServer())[operacion.metodo](`/api/v1${operacion.ruta()}`);
    if (operacion.ifMatch === true) {
      prueba = prueba.set('If-Match', '1');
    }
    if (token !== null) {
      prueba = prueba.set('Authorization', `Bearer ${token}`);
    }
    return operacion.cuerpo === undefined ? prueba : prueba.send(operacion.cuerpo);
  };

  /** Lo que una operación rechazada no debe cambiar. */
  const fotografia = async () => ({
    expediente: await prisma.expediente.findUniqueOrThrow({
      where: { numero },
      select: { estado: true, version: true, codigo_receta: true },
    }),
    esquela: await prisma.esquela.findUniqueOrThrow({
      where: { codigo },
      select: { numero_recibo: true },
    }),
    historial: await prisma.historial_estado.count(),
    auditoriaTramites: await prisma.auditoriaTramites.count(),
    auditoriaPagos: await prisma.auditoriaPagos.count(),
    observaciones: await prisma.observacion.count(),
    eventos: await prisma.evento_pendiente.count(),
  });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
    numero = (await sembrarExpediente(prisma, app.get<ProtectorDatos>(PROTECTOR_DATOS))).numero;
    await llevarAEstado(prisma, numero, 'PENDIENTE_PAGO');
    codigo = await sembrarEsquela(prisma, numero);
    for (const rol of ROLES) {
      clientes.set(rol, await clienteConRoles(app, prisma, redis, [rol]));
    }
  });

  afterAll(async () => {
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  describe.each(Object.keys(OPERACIONES))('%s', (nombre) => {
    const operacion = OPERACIONES[nombre] as Operacion;
    const prohibidos = ROLES.filter((rol) => !operacion.roles.includes(rol));

    it('sin sesión → 401 sin cambiar datos', async () => {
      const antes = await fotografia();
      expect((await operar(operacion, null)).status).toBe(401);
      expect(await fotografia()).toEqual(antes);
    });

    it.each(prohibidos)('%s → 403 sin cambiar datos', async (rol) => {
      const antes = await fotografia();
      expect((await operar(operacion, clientes.get(rol)?.token ?? null)).status).toBe(403);
      expect(await fotografia()).toEqual(antes);
    });
  });
});
