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
import { llevarAEstado } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { JPG_PRUEBA } from '../apoyo/identidad-prueba';
import { limpiar006, sembrarInspeccion, sembrarLicencia } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// Matriz de permisos de la 006 (SC-007): cada endpoint nuevo responde 401 sin sesión y 403 a cada rol
// que no corresponde, sin cambiar datos. Datos FICTICIOS.

interface Operacion {
  readonly metodo: 'get' | 'post' | 'delete';
  readonly ruta: () => string;
  readonly cuerpo?: object;
  readonly fotos?: boolean;
  readonly roles: readonly Rol[];
}

describe('Matriz de permisos de ITSE, licencia y plazos (SC-007 de la 006)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let numeroLicencia: string;
  let inspeccionId: string;
  let alertaId: string;
  const clientes = new Map<Rol, ClienteConSesion>();

  const OPERACIONES: Record<string, Operacion> = {
    obtenerLicencia: {
      metodo: 'get',
      ruta: () => `/licencias/${numeroLicencia}`,
      roles: ['MESA_PARTES', 'EVALUADOR', 'JEFATURA'],
    },
    descargarLicencia: {
      metodo: 'get',
      ruta: () => `/licencias/${numeroLicencia}/pdf`,
      roles: ['MESA_PARTES', 'EVALUADOR', 'JEFATURA'],
    },
    listarInspecciones: {
      metodo: 'get',
      ruta: () => '/inspecciones',
      roles: ['JEFATURA', 'INSPECTOR'],
    },
    listarInspectores: {
      metodo: 'get',
      ruta: () => '/inspecciones/inspectores',
      roles: ['JEFATURA'],
    },
    asignarInspector: {
      metodo: 'post',
      ruta: () => `/inspecciones/${inspeccionId}/asignar`,
      cuerpo: { inspectorId: '00000000-0000-4000-8000-0000000000aa', programadaPara: '2026-12-01' },
      roles: ['JEFATURA'],
    },
    registrarResultado: {
      metodo: 'post',
      ruta: () => `/inspecciones/${inspeccionId}/resultado`,
      fotos: true,
      roles: ['INSPECTOR'],
    },
    listarFeriados: {
      metodo: 'get',
      ruta: () => '/feriados?anio=2026',
      roles: ['MESA_PARTES', 'EVALUADOR', 'INSPECTOR', 'CAJA', 'JEFATURA', 'ADMINISTRADOR'],
    },
    registrarFeriado: {
      metodo: 'post',
      ruta: () => '/feriados',
      cuerpo: { fecha: '2026-12-31', descripcion: 'Feriado ficticio de prueba' },
      roles: ['ADMINISTRADOR'],
    },
    quitarFeriado: {
      metodo: 'delete',
      ruta: () => '/feriados/2026-12-25',
      roles: ['ADMINISTRADOR'],
    },
    listarAlertas: { metodo: 'get', ruta: () => '/plazos/alertas', roles: ['JEFATURA'] },
    atenderAlerta: {
      metodo: 'post',
      ruta: () => `/plazos/alertas/${alertaId}/atender`,
      roles: ['JEFATURA'],
    },
  };

  const operar = (operacion: Operacion, token: string | null) => {
    let prueba = request(app.getHttpServer())[operacion.metodo](`/api/v1${operacion.ruta()}`);
    if (token !== null) {
      prueba = prueba.set('Authorization', `Bearer ${token}`);
    }
    if (operacion.fotos === true) {
      return prueba.field('resultado', 'FAVORABLE').attach('fotos', JPG_PRUEBA, 'frente.jpg');
    }
    return operacion.cuerpo === undefined ? prueba : prueba.send(operacion.cuerpo);
  };

  /** Lo que una operación rechazada no debe cambiar. */
  const fotografia = async () => ({
    inspecciones: await prisma.inspeccion.findMany({
      select: { id: true, estado: true, inspector_id: true, resultado: true },
      orderBy: { id: 'asc' },
    }),
    fotos: await prisma.foto.count(),
    feriados: await prisma.feriado.count(),
    alertas: await prisma.alerta.findMany({
      select: { id: true, atendida_en: true },
      orderBy: { id: 'asc' },
    }),
    auditoriaInspecciones: await prisma.auditoriaInspecciones.count(),
    auditoriaLicencias: await prisma.auditoriaLicencias.count(),
    eventos: await prisma.evento_pendiente.count(),
  });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    await limpiar006(prisma);
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
    const protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    const conLicencia = (await sembrarExpediente(prisma, protector)).numero;
    await llevarAEstado(prisma, conLicencia, 'FINALIZADO');
    numeroLicencia = (await sembrarLicencia(prisma, conLicencia)).numero;
    const enInspeccion = (await sembrarExpediente(prisma, protector, { codigoReceta: 'LIC-03' }))
      .numero;
    await llevarAEstado(prisma, enInspeccion, 'EN_INSPECCION', { ruta: 'B' });
    inspeccionId = await sembrarInspeccion(prisma, enInspeccion);
    const alerta = await prisma.alerta.create({
      data: {
        numero_expediente: enInspeccion,
        vence_en: new Date('2026-12-01T00:00:00Z'),
        dias_habiles_restantes: 1,
      },
    });
    alertaId = String(alerta.id);
    for (const rol of ROLES) {
      clientes.set(rol, await clienteConRoles(app, prisma, redis, [rol]));
    }
  });

  afterAll(async () => {
    await limpiar006(prisma);
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

    if (prohibidos.length > 0) {
      it.each(prohibidos)('%s → 403 sin cambiar datos', async (rol) => {
        const antes = await fotografia();
        expect((await operar(operacion, clientes.get(rol)?.token ?? null)).status).toBe(403);
        expect(await fotografia()).toEqual(antes);
      });
    }
  });

  it('la verificación pública no pide sesión', async () => {
    const licencia = await prisma.licencia.findUniqueOrThrow({ where: { numero: numeroLicencia } });
    const respuesta = await request(app.getHttpServer()).get(
      `/api/v1/licencias/verificar/${licencia.codigo_verificacion}`,
    );
    expect(respuesta.status).toBe(200);
  });
});
