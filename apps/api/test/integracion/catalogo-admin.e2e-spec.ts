import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba, type LoggerCapturador } from '../apoyo/aplicacion-prueba';
import { fotografiarRecetas, restaurarRecetas, type FotoRecetas } from '../apoyo/catalogo-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Edición de recetas (historia 3 de la 003, contracts/catalogo-admin.md): FR-017 a FR-023 y FR-026.

const RUTA_PUT = '/catalogo/recetas/{codigoReceta}';

interface RequisitoApi {
  id: number;
  orden: number;
  descripcion: string;
  obligatorio: boolean;
  condicion: string;
}
interface RecetaApi {
  codigo: string;
  tasa: string;
  activa: boolean;
  actualizadaEn: string;
  requisitos: RequisitoApi[];
}
interface ProblemaApi {
  errores?: { campo: string; mensaje: string }[];
}

describe('Edición de recetas por el administrador (historia 3 de la 003)', () => {
  let app: INestApplication<App>;
  let logger: LoggerCapturador;
  let prisma: PrismaServicio;
  let redis: Redis;
  let foto: FotoRecetas;
  let admin: ClienteConSesion;

  const guardar = (codigo: string, cuerpo: object) =>
    admin.pedir('put', `/catalogo/recetas/${codigo}`, cuerpo);
  const filasCambio = () => prisma.cambio_receta.count();
  const fichaPublica = async (codigo: string) =>
    (await request(app.getHttpServer()).get(`/api/v1/catalogo/recetas/${codigo}`))
      .body as RecetaApi;
  const camposConError = (cuerpo: unknown) =>
    ((cuerpo as ProblemaApi).errores ?? []).map((error) => error.campo);

  beforeAll(async () => {
    ({ app, logger } = (await crearAplicacionDePrueba()) as {
      app: INestApplication<App>;
      logger: LoggerCapturador;
    });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    foto = await fotografiarRecetas(prisma, ['LIC-01', 'LIC-02']);
    admin = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
  });

  afterEach(async () => {
    await restaurarRecetas(prisma, redis, foto);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  describe('lectura de administración', () => {
    it('lista las 12 recetas con su estado y fecha de actualización, con no-store', async () => {
      const respuesta = await admin.pedir('get', '/admin/catalogo/recetas');

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['cache-control']).toBe('no-store');
      await esperarCumpleContrato('get', '/admin/catalogo/recetas', respuesta);
      const recetas = respuesta.body as RecetaApi[];
      expect(recetas).toHaveLength(12);
      expect(recetas.every((receta) => typeof receta.activa === 'boolean')).toBe(true);
      expect(recetas.every((receta) => !Number.isNaN(Date.parse(receta.actualizadaEn)))).toBe(true);
    });

    it('un código con formato inválido responde 422 con no-store', async () => {
      const respuesta = await admin.pedir('get', '/admin/catalogo/recetas/XYZ-01');

      expect(respuesta.status).toBe(422);
      expect(respuesta.headers['cache-control']).toBe('no-store');
      expect(camposConError(respuesta.body)).toEqual(['codigoReceta']);
    });
  });

  describe('guardar cambios', () => {
    it('el cambio de tasa responde 200 y deja un registro con el usuario y el antes/después', async () => {
      const respuesta = await guardar('LIC-02', { tasa: '180.00' });

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['cache-control']).toBe('no-store');
      await esperarCumpleContrato('put', RUTA_PUT, respuesta);
      expect((respuesta.body as RecetaApi).tasa).toBe('180.00');

      const registros = await prisma.cambio_receta.findMany({ where: { codigo_receta: 'LIC-02' } });
      expect(registros).toHaveLength(1);
      expect(registros[0]?.usuario_id).toBe(admin.usuario.id);
      expect(registros[0]?.cambios).toEqual({ tasa: { antes: '177.10', despues: '180.00' } });
      const receta = await prisma.receta.findUniqueOrThrow({ where: { codigo: 'LIC-02' } });
      expect(receta.actualizada_por).toBe(admin.usuario.id);
      expect((await fichaPublica('LIC-02')).tasa).toBe('180.00');
    });

    it('un PUT idéntico responde 200 y no agrega filas al registro (FR-022)', async () => {
      await guardar('LIC-02', { tasa: '180.00' });
      const filas = await filasCambio();

      const respuesta = await guardar('LIC-02', { tasa: '180.00' });

      expect(respuesta.status).toBe(200);
      await esperarCumpleContrato('put', RUTA_PUT, respuesta);
      expect(await filasCambio()).toBe(filas);
    });

    it('informa todos los errores juntos sin cambiar nada', async () => {
      const respuesta = await guardar('LIC-02', { tasa: '-1.00', requisitos: [] });

      expect(respuesta.status).toBe(422);
      await esperarCumpleContrato('put', RUTA_PUT, respuesta);
      expect(camposConError(respuesta.body)).toEqual(
        expect.arrayContaining(['tasa', 'requisitos']),
      );
      expect(await filasCambio()).toBe(0);
      expect((await fichaPublica('LIC-02')).tasa).toBe('177.10');
    });

    it.each([
      ['una tasa con 3 decimales', { tasa: '1.005' }, 'tasa'],
      ['un plazo 0', { plazoDias: 0 }, 'plazoDias'],
      [
        'un requisito de solo espacios',
        { requisitos: [{ descripcion: '   ', condicion: 'SIEMPRE' }] },
        'requisitos[0].descripcion',
      ],
      [
        'un requisito de 501 caracteres',
        { requisitos: [{ descripcion: 'a'.repeat(501), condicion: 'SIEMPRE' }] },
        'requisitos[0].descripcion',
      ],
      ['una licencia sin orden del ITSE', { ordenItse: null }, 'ordenItse'],
    ])('rechaza %s con 422 en %s', async (_, cuerpo, campo) => {
      const respuesta = await guardar('LIC-02', cuerpo);

      expect(respuesta.status).toBe(422);
      await esperarCumpleContrato('put', RUTA_PUT, respuesta);
      expect(camposConError(respuesta.body)).toContain(campo);
      expect(await filasCambio()).toBe(0);
    });

    it('una calificación que no corresponde a la ruta A responde 422 en calificacion', async () => {
      const respuesta = await guardar('LIC-01', {
        calificacion: 'EVALUACION_PREVIA_SILENCIO_POSITIVO',
      });

      expect(respuesta.status).toBe(422);
      expect(camposConError(respuesta.body)).toEqual(['calificacion']);
    });

    it('un trámite conectado con vigencia responde 422 en vigenciaMeses', async () => {
      const respuesta = await guardar('TRF-01', { vigenciaMeses: 12 });

      expect(respuesta.status).toBe(422);
      expect(camposConError(respuesta.body)).toEqual(['vigenciaMeses']);
    });

    it.each([{ nombre: 'X' }, { ruta: 'B' }, { codigoTupa: 'PE0' }])(
      'rechaza el campo no editable %o (FR-018)',
      async (cuerpo) => {
        const respuesta = await guardar('LIC-02', cuerpo);

        expect(respuesta.status).toBe(422);
        await esperarCumpleContrato('put', RUTA_PUT, respuesta);
        expect(camposConError(respuesta.body)).toEqual(Object.keys(cuerpo));
      },
    );

    it('un cuerpo vacío responde 422', async () => {
      const respuesta = await guardar('LIC-02', {});

      expect(respuesta.status).toBe(422);
      await esperarCumpleContrato('put', RUTA_PUT, respuesta);
      expect(camposConError(respuesta.body)).toEqual(['cuerpo']);
    });

    it('un código con formato inválido responde 422', async () => {
      const respuesta = await guardar('XYZ-01', { tasa: '1.00' });

      expect(respuesta.status).toBe(422);
      await esperarCumpleContrato('put', RUTA_PUT, respuesta);
      expect(camposConError(respuesta.body)).toEqual(['codigoReceta']);
    });
  });

  describe('requisitos', () => {
    const requisitosDe = async (codigo: string) =>
      ((await admin.pedir('get', `/admin/catalogo/recetas/${codigo}`)).body as RecetaApi)
        .requisitos;
    const comoCuerpo = (requisito: RequisitoApi) => ({
      id: requisito.id,
      descripcion: requisito.descripcion,
      obligatorio: requisito.obligatorio,
      condicion: requisito.condicion,
    });

    it('mover el tercer requisito al primer lugar cambia el orden público y conserva los id', async () => {
      const [primero, segundo, tercero, ...resto] = await requisitosDe('LIC-01');
      if (!primero || !segundo || !tercero) throw new Error('LIC-01 tiene al menos 3 requisitos');
      const nuevoOrden = [tercero, primero, segundo, ...resto];

      const respuesta = await guardar('LIC-01', { requisitos: nuevoOrden.map(comoCuerpo) });

      expect(respuesta.status).toBe(200);
      await esperarCumpleContrato('put', RUTA_PUT, respuesta);
      const publica = (await fichaPublica('LIC-01')).requisitos;
      expect(publica.map((requisito) => requisito.id)).toEqual(
        nuevoOrden.map((requisito) => requisito.id),
      );
      expect(publica.map((requisito) => requisito.orden)).toEqual(
        nuevoOrden.map((_, indice) => indice + 1),
      );
      const [registro] = await prisma.cambio_receta.findMany();
      expect(Object.keys(registro?.cambios as object)).toEqual(['requisitos']);
    });

    it('un requisito sin id aparece con un id nuevo', async () => {
      const actuales = await requisitosDe('LIC-02');

      const respuesta = await guardar('LIC-02', {
        requisitos: [
          ...actuales.map(comoCuerpo),
          { descripcion: '  Conformidad de zonificación  ', condicion: 'SIEMPRE' },
        ],
      });

      expect(respuesta.status).toBe(200);
      const requisitos = (respuesta.body as RecetaApi).requisitos;
      const nuevo = requisitos.at(-1);
      expect(nuevo?.descripcion).toBe('Conformidad de zonificación');
      expect(actuales.map((requisito) => requisito.id)).not.toContain(nuevo?.id);
      expect(requisitos.slice(0, -1).map((requisito) => requisito.id)).toEqual(
        actuales.map((requisito) => requisito.id),
      );
    });

    it('quitar un requisito lo borra y deja el orden consecutivo', async () => {
      const [primero, , ...resto] = await requisitosDe('LIC-02');
      if (!primero) throw new Error('LIC-02 tiene requisitos');

      const respuesta = await guardar('LIC-02', {
        requisitos: [primero, ...resto].map(comoCuerpo),
      });

      expect(respuesta.status).toBe(200);
      const requisitos = (respuesta.body as RecetaApi).requisitos;
      expect(requisitos.map((requisito) => requisito.orden)).toEqual(
        requisitos.map((_, indice) => indice + 1),
      );
      expect(await prisma.requisito.count({ where: { codigo_receta: 'LIC-02' } })).toBe(
        requisitos.length,
      );
    });

    it('un id de requisito de otra receta responde 422 en requisitos[0].id', async () => {
      const [ajeno] = await requisitosDe('LIC-03');
      if (!ajeno) throw new Error('LIC-03 tiene requisitos');

      const respuesta = await guardar('LIC-02', { requisitos: [comoCuerpo(ajeno)] });

      expect(respuesta.status).toBe(422);
      await esperarCumpleContrato('put', RUTA_PUT, respuesta);
      expect(camposConError(respuesta.body)).toEqual(['requisitos[0].id']);
    });
  });

  it('si no se puede guardar el registro, ni la receta ni los requisitos cambian (FR-021)', async () => {
    const requisitosAntes = await prisma.requisito.findMany({
      where: { codigo_receta: 'LIC-02' },
      orderBy: { orden: 'asc' },
    });
    // Un CHECK temporal que rechaza cualquier fila nueva del registro de cambios.
    await prisma.$executeRawUnsafe(
      'ALTER TABLE catalogo.cambio_receta ADD CONSTRAINT prueba_atomicidad CHECK (false) NOT VALID',
    );
    try {
      const respuesta = await guardar('LIC-02', {
        tasa: '250.00',
        requisitos: [{ descripcion: 'Único requisito', condicion: 'SIEMPRE' }],
      });

      expect(respuesta.status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE catalogo.cambio_receta DROP CONSTRAINT prueba_atomicidad',
      );
    }

    const receta = await prisma.receta.findUniqueOrThrow({ where: { codigo: 'LIC-02' } });
    expect(receta.tasa.toFixed(2)).toBe('177.10');
    expect(
      await prisma.requisito.findMany({
        where: { codigo_receta: 'LIC-02' },
        orderBy: { orden: 'asc' },
      }),
    ).toEqual(requisitosAntes);
    expect(await filasCambio()).toBe(0);
  });

  it('los registros del sistema no llevan el correo ni el nombre del administrador (FR-026)', async () => {
    logger.lineas.length = 0;

    await guardar('LIC-02', { tasa: '181.00' });
    await guardar('LIC-02', { tasa: '-5.00' });

    const texto = logger.lineas.join('\n');
    expect(texto).not.toContain(admin.usuario.correo);
    expect(texto).not.toContain(admin.usuario.nombre);
    const lineasReceta = logger.lineas.filter((linea) => linea.includes('receta actualizada'));
    expect(lineasReceta).toEqual([
      expect.stringContaining(
        `receta actualizada codigo=LIC-02 usuarioId=${admin.usuario.id} campos=tasa`,
      ),
    ]);
    expect(lineasReceta[0]).not.toContain('181');
  });
});
