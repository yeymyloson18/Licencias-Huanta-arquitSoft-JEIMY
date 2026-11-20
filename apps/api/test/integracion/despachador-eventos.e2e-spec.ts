import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import {
  DespachadorEventos,
  esperaTrasFallos,
} from '../../src/compartido/infraestructura/despachador-eventos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';

// Despachador de la cola de eventos (research §R-02 de la 005).

class ErrorDePrueba extends Error {
  constructor() {
    // El mensaje simula datos que nunca deben guardarse: solo se guarda el nombre.
    super('Documento 40000001 del titular');
    this.name = 'ErrorDePrueba';
  }
}

describe('Despachador de eventos (research §R-02 de la 005)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let despachador: DespachadorEventos;
  const recibidos: unknown[] = [];
  const ids: bigint[] = [];
  let fallosPendientes = 0;

  const crearEvento = (tipo: string, datos: object) =>
    prisma.evento_pendiente.create({ data: { tipo, datos } });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    despachador = app.get(DespachadorEventos);
    despachador.registrar('PruebaDespacho', (datos, meta) => {
      if (fallosPendientes > 0) {
        fallosPendientes -= 1;
        return Promise.reject(new ErrorDePrueba());
      }
      recibidos.push(datos);
      ids.push(meta.id);
      return Promise.resolve();
    });
  });

  beforeEach(async () => {
    recibidos.length = 0;
    ids.length = 0;
    fallosPendientes = 0;
    await prisma.evento_pendiente.deleteMany({
      where: { tipo: { in: ['PruebaDespacho', 'PruebaSinManejador'] } },
    });
  });

  afterAll(async () => {
    await prisma.evento_pendiente.deleteMany({
      where: { tipo: { in: ['PruebaDespacho', 'PruebaSinManejador'] } },
    });
    await app.close();
  });

  it('entrega los eventos en orden y los marca procesados', async () => {
    const primero = await crearEvento('PruebaDespacho', { orden: 1 });
    const segundo = await crearEvento('PruebaDespacho', { orden: 2 });

    const resultado = await despachador.procesarPendientes();

    expect(resultado).toMatchObject({ fallidos: 0 });
    expect(recibidos).toEqual([{ orden: 1 }, { orden: 2 }]);
    // El manejador recibe el id del evento (clave de idempotencia de los avisos, 006).
    expect(ids).toEqual([primero.id, segundo.id]);
    for (const evento of [primero, segundo]) {
      const fila = await prisma.evento_pendiente.findUniqueOrThrow({ where: { id: evento.id } });
      expect(fila.procesado_en).not.toBeNull();
    }
  });

  it('un evento procesado no se vuelve a entregar', async () => {
    await crearEvento('PruebaDespacho', { orden: 1 });
    await despachador.procesarPendientes();

    await despachador.procesarPendientes();

    expect(recibidos).toHaveLength(1);
  });

  it('tras un error guarda solo el nombre del error y espera antes de reintentar', async () => {
    fallosPendientes = 1;
    const evento = await crearEvento('PruebaDespacho', { orden: 1 });

    await despachador.procesarPendientes();
    const fallida = await prisma.evento_pendiente.findUniqueOrThrow({ where: { id: evento.id } });
    expect(fallida).toMatchObject({
      intentos: 1,
      ultimo_error: 'ErrorDePrueba',
      procesado_en: null,
    });
    expect(fallida.reintentar_en?.getTime()).toBeGreaterThan(Date.now());

    // Todavía no pasó la espera: no se reintenta.
    await despachador.procesarPendientes();
    expect(recibidos).toHaveLength(0);

    // Pasada la espera, se procesa.
    await prisma.evento_pendiente.update({
      where: { id: evento.id },
      data: { reintentar_en: new Date(Date.now() - 1000) },
    });
    await despachador.procesarPendientes();
    expect(recibidos).toEqual([{ orden: 1 }]);
  });

  it('no tiene límite de intentos', async () => {
    const evento = await crearEvento('PruebaDespacho', { orden: 1 });
    await prisma.evento_pendiente.update({ where: { id: evento.id }, data: { intentos: 25 } });

    await despachador.procesarPendientes();

    expect(recibidos).toEqual([{ orden: 1 }]);
  });

  it('no toca los tipos sin manejador', async () => {
    const evento = await crearEvento('PruebaSinManejador', { orden: 1 });

    await despachador.procesarPendientes();

    const fila = await prisma.evento_pendiente.findUniqueOrThrow({ where: { id: evento.id } });
    expect(fila).toMatchObject({ procesado_en: null, intentos: 0 });
  });

  it('si otra réplica tiene el candado, se salta la pasada', async () => {
    await crearEvento('PruebaDespacho', { orden: 1 });

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(4005001)::text AS candado`;
      return despachador.procesarPendientes();
    });

    expect(resultado).toBeNull();
    expect(recibidos).toHaveLength(0);
  });

  it('la espera crece y no pasa de 5 minutos', () => {
    expect(esperaTrasFallos(1)).toBe(4000);
    expect(esperaTrasFallos(2)).toBe(8000);
    expect(esperaTrasFallos(40)).toBe(5 * 60 * 1000);
  });

  it('no permite dos manejadores para el mismo tipo', () => {
    expect(() => {
      despachador.registrar('PruebaDespacho', () => Promise.resolve());
    }).toThrow(/Ya hay un manejador/);
  });
});
