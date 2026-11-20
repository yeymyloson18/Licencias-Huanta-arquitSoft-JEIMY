import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ProtectorDatos } from '../../src/compartido/dominio/protector-datos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { PROTECTOR_DATOS } from '../../src/compartido/infraestructura/protector-datos-aes-gcm';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import type { Rol } from '../../src/modulos/seguridad/dominio/rol';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarTramites, sembrarExpediente, TITULAR_DE_PRUEBA } from '../apoyo/expedientes-prueba';
import {
  confirmarIdentidad,
  PDF_PRUEBA,
  subirPdf,
  TITULAR_PRUEBA_1,
} from '../apoyo/identidad-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Historia 4 de la 004 (contracts/consulta-y-bandeja.md). Datos FICTICIOS.

interface Fila {
  numero: string;
  estado: string;
  ruta: string;
}

describe('Bandeja de expedientes del personal (historia 4 de la 004)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let prisma: PrismaServicio;
  let evaluador: ClienteConSesion;
  const sembrados: Record<string, string> = {};

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    const protector = app.get<ProtectorDatos>(PROTECTOR_DATOS);
    await limpiarTramites(prisma);
    await limpiarClavesSeguridad(redis);
    const dia = (n: number) => new Date(Date.UTC(2026, 10, n, 15));
    const casos = [
      ['a-registrado', 'LIC-02', 'REGISTRADO', dia(1)],
      ['b-registrado-viejo', 'LIC-03', 'REGISTRADO', dia(2)],
      ['b-observado', 'LIC-03', 'OBSERVADO', dia(3)],
      ['b-registrado-nuevo', 'LIC-03', 'REGISTRADO', dia(4)],
      ['a-observado', 'LIC-02', 'OBSERVADO', dia(5)],
    ] as const;
    for (const [nombre, codigoReceta, estado, presentadoEn] of casos) {
      sembrados[nombre] = (
        await sembrarExpediente(prisma, protector, { codigoReceta, estado, presentadoEn })
      ).numero;
    }
    evaluador = await clienteConRoles(app, prisma, redis, ['EVALUADOR']);
  });

  afterAll(async () => {
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('filtra estado=REGISTRADO y ruta=B, del más reciente al más antiguo, sin caché', async () => {
    const respuesta = await evaluador.pedir('get', '/expedientes?estado=REGISTRADO&ruta=B');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
    await esperarCumpleContrato('get', '/expedientes', respuesta);
    const cuerpo = respuesta.body as { total: number; datos: Fila[] };
    expect(cuerpo.total).toBe(2);
    expect(cuerpo.datos.map((fila) => fila.numero)).toEqual([
      sembrados['b-registrado-nuevo'],
      sembrados['b-registrado-viejo'],
    ]);
    expect(JSON.stringify(cuerpo)).not.toMatch(/40000001|10400000011|Ficticio/);
  });

  it('sin filtros lista todos y pagina', async () => {
    const primera = await evaluador.pedir('get', '/expedientes?porPagina=2');
    const tercera = await evaluador.pedir('get', '/expedientes?porPagina=2&pagina=3');

    expect((primera.body as { total: number }).total).toBe(5);
    expect((primera.body as { datos: Fila[] }).datos.map((f) => f.numero)).toEqual([
      sembrados['a-observado'],
      sembrados['b-registrado-nuevo'],
    ]);
    expect((tercera.body as { datos: Fila[] }).datos.map((f) => f.numero)).toEqual([
      sembrados['a-registrado'],
    ]);
  });

  it.each([
    ['asignadosAMi=true', 'asignadosAMi'],
    ['vencenAntesDe=2026-12-01', 'vencenAntesDe'],
    ['porPagina=51', 'porPagina'],
    ['estado=INVENTADO', 'estado'],
  ])('%s → 422', async (consulta, campo) => {
    const respuesta = await evaluador.pedir('get', `/expedientes?${consulta}`);

    expect(respuesta.status).toBe(422);
    await esperarCumpleContrato('get', '/expedientes', respuesta);
    expect(JSON.stringify(respuesta.body)).toContain(campo);
  });

  it.each<Rol>(['MESA_PARTES', 'EVALUADOR', 'JEFATURA'])(
    'el detalle muestra la dirección y el documento enmascarado a %s y registra VER_DETALLE',
    async (rol) => {
      const cliente = await clienteConRoles(app, prisma, redis, [rol]);
      const numero = sembrados['a-registrado'] ?? '';

      const respuesta = await cliente.pedir('get', `/expedientes/${numero}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['cache-control']).toBe('no-store');
      await esperarCumpleContrato('get', '/expedientes/{numeroExpediente}', respuesta);
      expect(respuesta.body).toMatchObject({
        numero,
        canal: 'EN_LINEA',
        direccion: TITULAR_DE_PRUEBA.direccion,
        documentoTitularEnmascarado: '4*****01',
        historial: [{ estadoNuevo: 'REGISTRADO' }],
      });
      expect(JSON.stringify(respuesta.body)).not.toContain(TITULAR_DE_PRUEBA.documento);
      const vistas = await prisma.auditoriaTramites.findMany({
        where: { numero_expediente: numero, accion: 'VER_DETALLE', usuario_id: cliente.usuario.id },
      });
      expect(vistas).toHaveLength(1);
    },
  );

  it('la consulta pública del mismo expediente no muestra la dirección', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/expedientes/consultar')
      .send({
        numeroExpediente: sembrados['a-registrado'],
        documento: TITULAR_DE_PRUEBA.documento,
      });

    expect(respuesta.status).toBe(200);
    expect(JSON.stringify(respuesta.body)).not.toContain(TITULAR_DE_PRUEBA.direccion);
  });

  it('un número inexistente → 404 sin registrar auditoría', async () => {
    const antes = await prisma.auditoriaTramites.count({ where: { accion: 'VER_DETALLE' } });

    const respuesta = await evaluador.pedir('get', '/expedientes/EXP-2026-999999');

    expect(respuesta.status).toBe(404);
    await esperarCumpleContrato('get', '/expedientes/{numeroExpediente}', respuesta);
    expect(await prisma.auditoriaTramites.count({ where: { accion: 'VER_DETALLE' } })).toBe(antes);
  });

  describe('descarga de documentos', () => {
    let numero: string;
    let documentoId: string;

    beforeAll(async () => {
      // Un expediente real, presentado en línea con un PDF (para comparar el SHA-256).
      const { token } = await confirmarIdentidad(app, redis);
      const ficha = await request(app.getHttpServer()).get('/api/v1/catalogo/recetas/LIC-02');
      const requisitos = (ficha.body as { requisitos: { id: number; condicion: string }[] })
        .requisitos;
      const documentos = [];
      for (const requisito of requisitos.filter((r) => r.condicion === 'SIEMPRE')) {
        documentos.push({ requisitoId: requisito.id, documentoId: await subirPdf(app, token) });
      }
      const presentada = await request(app.getHttpServer())
        .post('/api/v1/expedientes')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          codigoReceta: 'LIC-02',
          identidad: TITULAR_PRUEBA_1,
          nombreTitular: 'Titular de Prueba Uno',
          giro: 'Bodega',
          direccion: 'Jr. Ficticio 123',
          zona: 'Centro',
          areaM2: 40,
          documentos,
        })
        .expect(201);
      numero = (presentada.body as { numero: string }).numero;
      const detalle = await evaluador.pedir('get', `/expedientes/${numero}`).expect(200);
      documentoId = (detalle.body as { documentos: { id: string }[] }).documentos[0]?.id ?? '';
    });

    it('entrega el archivo como adjunto, sin caché, con nosniff y el mismo SHA-256', async () => {
      const respuesta = await evaluador
        .pedir('get', `/expedientes/${numero}/documentos/${documentoId}`)
        .buffer(true)
        .parse((res, listo) => {
          const partes: Buffer[] = [];
          res.on('data', (parte: Buffer) => partes.push(parte));
          res.on('end', () => {
            listo(null, Buffer.concat(partes));
          });
        });

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['content-type']).toMatch(/^application\/pdf/);
      expect(respuesta.headers['content-disposition']).toMatch(
        /^attachment; filename="solicitud\.pdf"/,
      );
      expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
      expect(respuesta.headers['cache-control']).toBe('no-store');
      const sha = (contenido: Buffer) => createHash('sha256').update(contenido).digest('hex');
      expect(sha(respuesta.body as Buffer)).toBe(sha(PDF_PRUEBA));
    });

    it('un documento de otro expediente → 404', async () => {
      const respuesta = await evaluador.pedir(
        'get',
        `/expedientes/${sembrados['a-registrado'] ?? ''}/documentos/${documentoId}`,
      );

      expect(respuesta.status).toBe(404);
      await esperarCumpleContrato(
        'get',
        '/expedientes/{numeroExpediente}/documentos/{documentoId}',
        respuesta,
      );
    });

    it('un id que no es UUID → 404', async () => {
      const respuesta = await evaluador.pedir('get', `/expedientes/${numero}/documentos/no-uuid`);

      expect(respuesta.status).toBe(404);
    });
  });
});
