import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { EnviarAvisosPendientes } from '../../src/modulos/notificaciones/aplicacion/avisos';
import { clienteConRoles } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarPagos } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { limpiar006 } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { pedirEn, type Personal, recorrerRuta } from '../apoyo/recorrido-006';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// Recorridos completos de la 006 (SC-003, SC-009): las tres rutas desde el expediente registrado, con
// historial, licencia, eventos y un aviso por cada cambio de estado. Datos FICTICIOS.

const RECETA = { A: 'LIC-02', B: 'LIC-03', C: 'LIC-09' } as const;

const ESPERADO = {
  A: [
    'EN_EVALUACION',
    'PENDIENTE_PAGO',
    'PAGADO',
    'APROBADO',
    'LICENCIA_EMITIDA',
    'ITSE_POSTERIOR_PENDIENTE',
    'FINALIZADO',
  ],
  B: [
    'EN_EVALUACION',
    'PENDIENTE_PAGO',
    'PAGADO',
    'EN_INSPECCION',
    'LICENCIA_EMITIDA',
    'FINALIZADO',
  ],
  C: ['EN_EVALUACION', 'PAGADO', 'APROBADO', 'LICENCIA_PROVISIONAL'],
} as const;

describe('Recorridos completos de las rutas A, B y C (SC-003 de la 006)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let personal: Personal;

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarClavesSeguridad(redis);
    const inspector = await clienteConRoles(app, prisma, redis, ['INSPECTOR']);
    personal = {
      evaluador: (await clienteConRoles(app, prisma, redis, ['EVALUADOR'])).token,
      caja: (await clienteConRoles(app, prisma, redis, ['CAJA'])).token,
      jefatura: (await clienteConRoles(app, prisma, redis, ['JEFATURA'])).token,
      inspector: { id: inspector.usuario.id, token: inspector.token },
    };
  });

  beforeEach(async () => {
    await limpiar006(prisma);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiar006(prisma);
    await limpiarPagos(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it.each(['A', 'B', 'C'] as const)('ruta %s de principio a fin', async (ruta) => {
    const { numero } = await sembrarExpediente(prisma, protector, { codigoReceta: RECETA[ruta] });

    await recorrerRuta({ app, prisma, pedir: pedirEn(app), personal }, numero, ruta);

    const historial = await prisma.historial_estado.findMany({
      where: { expediente: { numero } },
      orderBy: { ocurrido_en: 'asc' },
    });
    expect(historial.map((h) => h.estado_nuevo).slice(-ESPERADO[ruta].length)).toEqual(
      ESPERADO[ruta],
    );
    const expediente = await prisma.expediente.findUniqueOrThrow({ where: { numero } });
    expect(expediente.estado).toBe(ESPERADO[ruta].at(-1));

    const licencia = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: numero },
      include: { certificado_itse: true },
    });
    expect(licencia.tipo).toBe(ruta === 'C' ? 'PROVISIONAL' : 'DEFINITIVA');
    expect(licencia.certificado_itse).toHaveLength(ruta === 'C' ? 0 : 1);
    const inspecciones = await prisma.inspeccion.findMany({ where: { numero_expediente: numero } });
    expect(inspecciones.map((i) => [i.tipo, i.estado])).toEqual([
      [
        { A: 'POSTERIOR', B: 'PREVIA', C: 'BODEGA' }[ruta],
        ruta === 'C' ? 'PENDIENTE' : 'REALIZADA',
      ],
    ]);

    // Un aviso por cada cambio de estado, todos enviados al simulado; nada queda en la cola.
    const avisos = await prisma.mensaje.findMany({ where: { numero_expediente: numero } });
    expect(avisos).toHaveLength(ESPERADO[ruta].length);
    await app.get(EnviarAvisosPendientes).ejecutar();
    expect(
      await prisma.mensaje.count({ where: { numero_expediente: numero, estado: 'ENVIADO' } }),
    ).toBe(ESPERADO[ruta].length);
    expect(await prisma.evento_pendiente.count({ where: { procesado_en: null } })).toBe(0);
  });
});
