import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { FachadaPlazos } from '../../src/modulos/plazos/fachada';
import { RelojPlazos } from '../../src/modulos/plazos/infraestructura/reloj-plazos';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { llevarAEstado } from '../apoyo/evaluacion-prueba';
import { limpiarTramites, sembrarExpediente } from '../apoyo/expedientes-prueba';
import { limpiar006 } from '../apoyo/itse-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 4 de la 006: reloj de plazos y alertas para la jefatura (EQ-07). Datos FICTICIOS.

const hoyLima = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

describe('Reloj de plazos y alertas (historia 4 de la 006)', () => {
  let app: INestApplication<App>;
  let otraReplica: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;
  let plazos: FachadaPlazos;
  let jefatura: ClienteConSesion;
  let evaluador: ClienteConSesion;

  /** Expediente en `estado` que vence dentro de `dias` días hábiles. */
  const queVence = async (
    dias: number,
    estado: 'EN_EVALUACION' | 'OBSERVADO' | 'PAGADO' = 'EN_EVALUACION',
  ) => {
    const { numero } = await sembrarExpediente(prisma, protector);
    await llevarAEstado(prisma, numero, estado);
    const vence = await plazos.sumarDiasHabiles(hoyLima(), dias);
    await prisma.expediente.update({
      where: { numero },
      data: { vence_plazo_en: new Date(`${vence}T00:00:00Z`) },
    });
    return { numero, vence };
  };

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    ({ app: otraReplica } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    plazos = app.get(FachadaPlazos);
    await limpiarClavesSeguridad(redis);
    jefatura = await clienteConRoles(app, prisma, redis, ['JEFATURA']);
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
  });

  beforeEach(async () => {
    await limpiar006(prisma);
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiar006(prisma);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await otraReplica.close();
    await app.close();
  });

  it('alerta a los que les quedan 2 días hábiles o menos; no a los suspendidos ni con 3 o más', async () => {
    const uno = await queVence(1);
    const dos = await queVence(2, 'PAGADO');
    await queVence(3);
    await queVence(1, 'OBSERVADO');

    expect(await app.get(RelojPlazos).ejecutarPasada()).toEqual(['alertas-de-plazo']);

    const alertas = await prisma.alerta.findMany({ orderBy: { vence_en: 'asc' } });
    expect(alertas.map((a) => [a.numero_expediente, a.dias_habiles_restantes])).toEqual([
      [uno.numero, 1],
      [dos.numero, 2],
    ]);
  });

  it('dos réplicas a la vez y pasadas repetidas: una sola alerta por expediente y vencimiento', async () => {
    const { numero } = await queVence(0);

    const resultados = await Promise.all([
      app.get(RelojPlazos).ejecutarPasada(),
      otraReplica.get(RelojPlazos).ejecutarPasada(),
      app.get(RelojPlazos).ejecutarPasada(),
    ]);
    await otraReplica.get(RelojPlazos).ejecutarPasada();

    expect(resultados.some((r) => r !== null)).toBe(true);
    expect(await prisma.alerta.count({ where: { numero_expediente: numero } })).toBe(1);
  });

  it('la jefatura ve las alertas de la más urgente a la menos y las atiende', async () => {
    const vencido = await queVence(1);
    await prisma.expediente.update({
      where: { numero: vencido.numero },
      data: { vence_plazo_en: new Date('2026-01-05T00:00:00Z') },
    });
    const pronto = await queVence(2);
    await app.get(RelojPlazos).ejecutarPasada();

    const lista = await jefatura.pedir('get', '/plazos/alertas');

    expect(lista.status).toBe(200);
    await esperarCumpleContrato('get', '/plazos/alertas', lista);
    const datos = lista.body as {
      id: number;
      numeroExpediente: string;
      diasHabilesRestantes: number;
      estadoExpediente: string;
    }[];
    expect(datos.map((a) => a.numeroExpediente)).toEqual([vencido.numero, pronto.numero]);
    expect(datos[0]?.diasHabilesRestantes).toBeLessThan(0);
    expect(datos[1]).toMatchObject({ diasHabilesRestantes: 2, estadoExpediente: 'EN_EVALUACION' });

    const id = datos[0]?.id ?? 0;
    const atendida = await jefatura.pedir('post', `/plazos/alertas/${String(id)}/atender`);
    expect(atendida.status).toBe(200);
    await esperarCumpleContrato('post', '/plazos/alertas/{alertaId}/atender', atendida);
    expect(atendida.body).toMatchObject({ atendidaPor: jefatura.usuario.id });
    expect((await jefatura.pedir('post', `/plazos/alertas/${String(id)}/atender`)).status).toBe(
      409,
    );
    expect((await jefatura.pedir('post', '/plazos/alertas/999999/atender')).status).toBe(404);
    expect(((await jefatura.pedir('get', '/plazos/alertas')).body as unknown[]).length).toBe(1);
    expect(
      ((await jefatura.pedir('get', '/plazos/alertas?pendientes=false')).body as unknown[]).length,
    ).toBe(2);
    expect((await evaluador.pedir('get', '/plazos/alertas')).status).toBe(403);
  });
});
