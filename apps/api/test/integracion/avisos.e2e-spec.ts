import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import {
  CrearAviso,
  EnviarAvisosPendientes,
} from '../../src/modulos/notificaciones/aplicacion/avisos';
import { RepositorioAvisosPostgres } from '../../src/modulos/notificaciones/infraestructura/repositorio-avisos-postgres';
import { RelojPlazos } from '../../src/modulos/plazos/infraestructura/reloj-plazos';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';
import { limpiar006, procesarTodo, sembrarLicencia } from '../apoyo/itse-prueba';

// Historia 5 de la 006: avisos al administrado (simulados). Datos FICTICIOS.

const dentroDe = (dias: number) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  const fecha = new Date(`${hoy}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha;
};

describe('Avisos al administrado (historia 5 de la 006)', () => {
  let app: INestApplication<App>;
  let otraReplica: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let protector: ProtectorDatos;

  const limpiarAvisosSimulados = async () => {
    const claves = await redis.keys('dev:aviso:*');
    if (claves.length > 0) {
      await redis.del(...claves);
    }
  };

  const cambio = async (numero: string, estadoNuevo = 'PAGADO') =>
    prisma.evento_pendiente.create({
      data: {
        tipo: 'EstadoExpedienteCambiado',
        datos: { numeroExpediente: numero, estadoAnterior: 'PENDIENTE_PAGO', estadoNuevo },
      },
    });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    ({ app: otraReplica } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
  });

  beforeEach(async () => {
    await limpiar006(prisma);
    await limpiarTramites(prisma);
    await limpiarAvisosSimulados();
  });

  afterAll(async () => {
    await limpiar006(prisma);
    await limpiarTramites(prisma);
    await limpiarAvisosSimulados();
    await otraReplica.close();
    await app.close();
  });

  it('un cambio de estado crea un aviso cifrado y sin datos personales, y se envía al simulado', async () => {
    const { numero } = await sembrarExpediente(prisma, protector);
    const evento = await cambio(numero);

    await procesarTodo(app);

    const mensaje = await prisma.mensaje.findFirstOrThrow({ where: { numero_expediente: numero } });
    expect(mensaje).toMatchObject({
      canal: 'CORREO',
      plantilla: 'CAMBIO_ESTADO',
      estado: 'PENDIENTE',
      evento_id: evento.id,
    });
    expect(protector.descifrar(mensaje.destino_cifrado)).toBe(TITULAR_DE_PRUEBA.correo);
    expect(Buffer.from(mensaje.destino_cifrado).toString('latin1')).not.toContain(
      TITULAR_DE_PRUEBA.correo,
    );
    expect(mensaje.datos).toMatchObject({ numeroExpediente: numero, estado: 'PAGADO' });

    expect(await app.get(EnviarAvisosPendientes).ejecutar()).toEqual({ enviados: 1, fallidos: 0 });
    expect((await prisma.mensaje.findUniqueOrThrow({ where: { id: mensaje.id } })).estado).toBe(
      'ENVIADO',
    );
    const simulado = JSON.parse((await redis.get(`dev:aviso:${mensaje.id}`)) ?? '{}') as {
      canal: string;
      texto: string;
    };
    expect(simulado.canal).toBe('CORREO');
    expect(simulado.texto).toContain(numero);
    const texto = JSON.stringify([mensaje.datos, simulado]);
    for (const dato of [
      TITULAR_DE_PRUEBA.documento,
      TITULAR_DE_PRUEBA.ruc,
      TITULAR_DE_PRUEBA.celular,
      TITULAR_DE_PRUEBA.correo,
      TITULAR_DE_PRUEBA.direccion,
    ]) {
      expect(texto).not.toContain(dato);
    }
  });

  it('el mismo evento entregado dos veces crea un solo aviso', async () => {
    const { numero } = await sembrarExpediente(prisma, protector);
    const crear = app.get(CrearAviso);
    const evento = { eventoId: 987654321n, numeroExpediente: numero, estadoNuevo: 'EN_EVALUACION' };

    await crear.cambioDeEstado(evento);
    await crear.cambioDeEstado(evento);

    expect(await prisma.mensaje.count({ where: { numero_expediente: numero } })).toBe(1);
  });

  it('un envío que falla se reintenta con espera y al quinto intento queda FALLIDO', async () => {
    const { numero } = await sembrarExpediente(prisma, protector);
    await cambio(numero);
    await procesarTodo(app);
    const fallando = new EnviarAvisosPendientes({
      avisos: new RepositorioAvisosPostgres(prisma, protector),
      enviador: { enviar: () => Promise.reject(new Error('sin conexión')) },
      reloj: { ahora: () => new Date() },
    });

    for (let intento = 1; intento <= 5; intento += 1) {
      await fallando.ejecutar();
      const fila = await prisma.mensaje.findFirstOrThrow({ where: { numero_expediente: numero } });
      expect(fila.intentos).toBe(intento);
      expect(fila.ultimo_error).toBe('Error');
      if (intento === 5) {
        break;
      }
      await prisma.mensaje.update({
        where: { id: fila.id },
        data: { reintentar_en: new Date(Date.now() - 1000) },
      });
    }

    const final = await prisma.mensaje.findFirstOrThrow({ where: { numero_expediente: numero } });
    expect(final).toMatchObject({ estado: 'FALLIDO', intentos: 5, reintentar_en: null });
  });

  it('certificado que vence en 29 días: un solo aviso con el reloj repetido y en dos réplicas', async () => {
    const { numero } = await sembrarExpediente(prisma, protector);
    await sembrarLicencia(prisma, numero);
    const licencia = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: numero },
    });
    await prisma.certificado_itse.create({
      data: {
        licencia_id: licencia.id,
        numero: 'ITSE-AVISO-1',
        emitido_en: dentroDe(-700),
        vence_en: dentroDe(29),
      },
    });
    const otro = await sembrarExpediente(prisma, protector);
    await sembrarLicencia(prisma, otro.numero);
    const lejana = await prisma.licencia.findFirstOrThrow({
      where: { numero_expediente: otro.numero },
    });
    await prisma.certificado_itse.create({
      data: {
        licencia_id: lejana.id,
        numero: 'ITSE-AVISO-2',
        emitido_en: dentroDe(-10),
        vence_en: dentroDe(300),
      },
    });

    await Promise.all([
      app.get(RelojPlazos).ejecutarPasada(),
      otraReplica.get(RelojPlazos).ejecutarPasada(),
    ]);
    await app.get(RelojPlazos).ejecutarPasada();
    await procesarTodo(app);

    const avisos = await prisma.mensaje.findMany({ where: { plantilla: 'ITSE_POR_VENCER' } });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ numero_expediente: numero });
    expect(
      (await prisma.certificado_itse.findUniqueOrThrow({ where: { numero: 'ITSE-AVISO-1' } }))
        .aviso_enviado_en,
    ).not.toBeNull();
    expect(
      (await prisma.certificado_itse.findUniqueOrThrow({ where: { numero: 'ITSE-AVISO-2' } }))
        .aviso_enviado_en,
    ).toBeNull();
  });
});
