import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import {
  CONFIGURACION,
  type Configuracion,
} from '../../src/compartido/infraestructura/configuracion';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { ALMACEN_ARCHIVOS } from '../../src/modulos/tramites/tramites.module';
import type { AlmacenArchivos } from '../../src/modulos/tramites/dominio/puertos/almacen-archivos';
import { TareaDescarteDocumentos } from '../../src/modulos/tramites/infraestructura/tarea-descarte-documentos';
import { crearAplicacionDePrueba, type LoggerCapturador } from '../apoyo/aplicacion-prueba';
import { limpiarTramites } from '../apoyo/expedientes-prueba';
import { PDF_PRUEBA } from '../apoyo/identidad-prueba';

// Descarte de documentos temporales vencidos (FR-014, research §R-09 de la 004).

const HORA = 60 * 60 * 1000;

describe('Descarte de documentos temporales vencidos', () => {
  let app: INestApplication<App>;
  let logger: LoggerCapturador;
  let prisma: PrismaServicio;
  let almacen: AlmacenArchivos;
  let carpeta: string;

  const sembrar = async (horasAntes: number, nombre: string) => {
    const clave = randomUUID();
    await almacen.guardar(clave, PDF_PRUEBA);
    const fila = await prisma.documento_temporal.create({
      data: {
        clave_almacen: clave,
        nombre_original: nombre,
        tipo_mime: 'application/pdf',
        tamano_bytes: PDF_PRUEBA.length,
        sha256: 'a'.repeat(64),
        verificacion_id: randomUUID(),
        subido_en: new Date(Date.now() - horasAntes * HORA),
      },
    });
    return { id: fila.id, clave };
  };

  const existe = async (clave: string) =>
    access(join(carpeta, clave)).then(
      () => true,
      () => false,
    );

  beforeAll(async () => {
    const creada = await crearAplicacionDePrueba();
    app = creada.app as INestApplication<App>;
    logger = creada.logger;
    prisma = app.get(PrismaServicio);
    almacen = app.get<AlmacenArchivos>(ALMACEN_ARCHIVOS);
    carpeta = app.get<Configuracion>(CONFIGURACION).almacenArchivosRuta;
  });

  beforeEach(async () => {
    await limpiarTramites(prisma);
  });

  afterAll(async () => {
    await limpiarTramites(prisma);
    await app.close();
  });

  it('borra fila y archivo del documento de 25 h y conserva el de 1 h', async () => {
    const viejo = await sembrar(25, 'viejo-confidencial.pdf');
    const reciente = await sembrar(1, 'reciente.pdf');

    const borrados = await app.get(TareaDescarteDocumentos).ejecutarUnaVez();

    expect(borrados).toBe(1);
    expect(await prisma.documento_temporal.findUnique({ where: { id: viejo.id } })).toBeNull();
    expect(await existe(viejo.clave)).toBe(false);
    expect(
      await prisma.documento_temporal.findUnique({ where: { id: reciente.id } }),
    ).not.toBeNull();
    expect(await existe(reciente.clave)).toBe(true);
  });

  it('registra solo cuántos borró, sin nombres ni claves', async () => {
    const viejo = await sembrar(30, 'viejo-confidencial.pdf');

    await app.get(TareaDescarteDocumentos).ejecutarUnaVez();

    const texto = logger.lineas.join('\n');
    expect(texto).toContain('Documentos temporales vencidos descartados: 1');
    expect(texto).not.toContain('viejo-confidencial');
    expect(texto).not.toContain(viejo.clave);
  });

  it('si otra réplica tiene el candado, se salta la pasada', async () => {
    const viejo = await sembrar(30, 'viejo.pdf');
    const tarea = app.get(TareaDescarteDocumentos);

    // Otra "réplica" sostiene el candado consultivo mientras esta intenta trabajar.
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(4004001)::text AS candado`;
      return tarea.ejecutarUnaVez();
    });

    expect(resultado).toBeNull();
    expect(await prisma.documento_temporal.findUnique({ where: { id: viejo.id } })).not.toBeNull();
  });
});
