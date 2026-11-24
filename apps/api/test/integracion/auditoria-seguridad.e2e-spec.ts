import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DespachadorEventos } from '../../src/compartido/infraestructura/despachador-eventos';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { clienteConRoles, type ClienteConSesion } from '../apoyo/admin-prueba';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { fotografiarRecetas, restaurarRecetas, type FotoRecetas } from '../apoyo/catalogo-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { leerOtpSimulado, limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { iniciarSesionDePrueba } from '../apoyo/sesion-prueba';
import { crearUsuarioDePrueba, type UsuarioDePrueba } from '../apoyo/usuarios-prueba';
import { esperarCumpleContrato } from '../apoyo/validarContrato';

// Auditoría de seguridad (HU2 y FR-006 a FR-014 de la 009): cada acción queda registrada al ocurrir,
// sin datos personales, y se consulta con filtros y en CSV. La tabla solo admite agregar filas.
// SESIONES_CERRADAS y CUENTA_DESBLOQUEADA se prueban en administrador.e2e-spec.ts.
//
// La auditoría no se puede borrar: cada prueba filtra por los ids que crea (actor, afectado u
// objeto) y por la hora de inicio, nunca por totales globales.

const HMAC = /^[0-9a-f]{64}$/;

describe('Auditoría de seguridad (009)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;
  let despachador: DespachadorEventos;
  let admin: ClienteConSesion;
  let foto: FotoRecetas;

  const http = () => request(app.getHttpServer());

  const eventos = (filtro: Prisma.AuditoriaSeguridadWhereInput) =>
    prisma.auditoriaSeguridad.findMany({ where: filtro, orderBy: { id: 'asc' } });

  const intentar = (correo: string, clave: string, origen: string) =>
    http()
      .post('/api/v1/auth/iniciar-sesion')
      .set('X-Forwarded-For', origen)
      .send({ correo, clave });

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
    despachador = app.get(DespachadorEventos);
    // Sin otros administradores: la regla del último administrador debe poder rechazar.
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    foto = await fotografiarRecetas(prisma, ['LIC-06']);
    admin = await clienteConRoles(app, prisma, redis, ['ADMINISTRADOR']);
  });

  beforeEach(async () => {
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await restaurarRecetas(prisma, redis, foto);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  describe('ingresos', () => {
    let persona: UsuarioDePrueba;

    beforeAll(async () => {
      persona = await crearUsuarioDePrueba(prisma, { roles: ['CAJA'] });
    });

    it('INGRESO_CORRECTO: la persona es actor y afectada, con la huella del origen', async () => {
      await iniciarSesionDePrueba(app, redis, persona);

      const [ingreso] = await eventos({
        afectado_usuario_id: persona.id,
        accion: 'INGRESO_CORRECTO',
      });
      expect(ingreso).toMatchObject({
        actor_usuario_id: persona.id,
        resultado: 'EXITO',
      });
      expect(ingreso?.origen_hmac).toMatch(HMAC);
    });

    it('CLAVE_INCORRECTA: sin actor, sobre la cuenta y con el motivo', async () => {
      expect((await intentar(persona.correo, 'ClaveEquivocada2026', '10.9.0.1')).status).toBe(401);

      const [fallo] = await eventos({
        afectado_usuario_id: persona.id,
        accion: 'CLAVE_INCORRECTA',
      });
      expect(fallo).toMatchObject({
        actor_usuario_id: null,
        resultado: 'RECHAZADO',
        detalle: { motivo: 'CLAVE' },
      });
    });

    it('CODIGO_INCORRECTO: un código equivocado queda sobre la cuenta', async () => {
      const paso1 = await intentar(persona.correo, persona.clave, '10.9.0.2').expect(200);
      const real = await leerOtpSimulado(redis, persona.id);

      const paso2 = await http()
        .post('/api/v1/auth/verificar-otp')
        .set('X-Forwarded-For', '10.9.0.2')
        .send({
          desafioId: (paso1.body as { desafioId: string }).desafioId,
          codigo: real === '000000' ? '111111' : '000000',
        });

      expect(paso2.status).toBe(401);
      expect(
        await eventos({ afectado_usuario_id: persona.id, accion: 'CODIGO_INCORRECTO' }),
      ).toHaveLength(1);
    });

    it('un correo que no existe se registra sin identificar a nadie (FR-014)', async () => {
      const inicio = new Date();
      const correo = 'nadie.registrado.009@ejemplo.pe';

      expect((await intentar(correo, 'Cualquiera2026', '10.9.0.3')).status).toBe(401);

      const filas = await eventos({
        accion: 'CLAVE_INCORRECTA',
        afectado_usuario_id: null,
        ocurrido_en: { gte: inicio },
      });
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        actor_usuario_id: null,
        detalle: { motivo: 'CORREO_NO_REGISTRADO' },
      });
      const texto = JSON.stringify(filas, (_, valor: unknown) =>
        typeof valor === 'bigint' ? valor.toString() : valor,
      );
      expect(texto).not.toContain('nadie.registrado');
      expect(texto).not.toContain('10.9.0.3');
    });

    it('CUENTA_BLOQUEADA: al 6.º intento de la cuenta, con los segundos', async () => {
      const bloqueada = await crearUsuarioDePrueba(prisma);
      for (let i = 0; i < 5; i += 1) {
        await intentar(bloqueada.correo, 'Equivocada2026', `10.9.1.${String(i)}`).expect(401);
      }

      expect((await intentar(bloqueada.correo, bloqueada.clave, '10.9.1.9')).status).toBe(429);

      const [bloqueo] = await eventos({
        afectado_usuario_id: bloqueada.id,
        accion: 'CUENTA_BLOQUEADA',
      });
      expect(bloqueo?.detalle).toMatchObject({ segundos: expect.any(Number) as number });
    });

    it('ORIGEN_BLOQUEADO: 5 fallos desde un origen bloquean otros correos', async () => {
      const inicio = new Date();
      for (let i = 0; i < 5; i += 1) {
        await intentar(`otro${String(i)}.009@ejemplo.pe`, 'Equivocada2026', '10.9.2.1').expect(401);
      }

      expect((await intentar(persona.correo, persona.clave, '10.9.2.1')).status).toBe(429);

      const [bloqueo] = await eventos({ accion: 'ORIGEN_BLOQUEADO', ocurrido_en: { gte: inicio } });
      expect(bloqueo).toMatchObject({ afectado_usuario_id: persona.id, actor_usuario_id: null });
      expect(bloqueo?.origen_hmac).toMatch(HMAC);
    });

    it('CIERRE_SESION y CLAVE_CAMBIADA: la persona sobre su propia cuenta', async () => {
      const otra = await crearUsuarioDePrueba(prisma);
      const sesion = await iniciarSesionDePrueba(app, redis, otra);

      await http()
        .post('/api/v1/auth/cambiar-clave')
        .set('Authorization', `Bearer ${sesion.accessToken}`)
        .set('Cookie', sesion.cookie)
        .send({ claveActual: otra.clave, claveNueva: 'ClaveNuevaDe2026' })
        .expect(200);
      await http().post('/api/v1/auth/cerrar-sesion').set('Cookie', sesion.cookie).expect(204);

      const filas = await eventos({
        afectado_usuario_id: otra.id,
        accion: { in: ['CLAVE_CAMBIADA', 'CIERRE_SESION'] },
      });
      expect(filas.map((f) => [f.accion, f.actor_usuario_id])).toEqual([
        ['CLAVE_CAMBIADA', otra.id],
        ['CIERRE_SESION', otra.id],
      ]);
      expect(JSON.stringify(filas.map((f) => f.detalle))).not.toContain('ClaveNuevaDe2026');
    });
  });

  describe('gestión de usuarios', () => {
    it('crear, editar, desactivar, reactivar, roles y clave temporal quedan con el administrador', async () => {
      const creado = await admin
        .pedir('post', '/usuarios', {
          correo: 'gestion.009@ejemplo.pe',
          nombreCompleto: 'Persona De Gestion',
          celular: '987650009',
          claveTemporal: 'ClaveTemporal2026x',
          roles: ['CAJA'],
        })
        .expect(201);
      const id = (creado.body as { id: string }).id;

      await admin
        .pedir('patch', `/usuarios/${id}`, {
          nombreCompleto: 'Persona Corregida',
          celular: '912340009',
        })
        .expect(200);
      await admin.pedir('patch', `/usuarios/${id}`, { activo: false }).expect(200);
      await admin.pedir('patch', `/usuarios/${id}`, { activo: true }).expect(200);
      await admin.pedir('put', `/usuarios/${id}/roles`, { roles: ['EVALUADOR'] }).expect(200);
      await admin
        .pedir('post', `/usuarios/${id}/clave-temporal`, { claveTemporal: 'OtraTemporal2026x' })
        .expect(204);

      const filas = await eventos({ afectado_usuario_id: id });
      expect(filas.map((f) => [f.accion, f.actor_usuario_id, f.detalle])).toEqual([
        ['USUARIO_CREADO', admin.usuario.id, { roles: ['CAJA'] }],
        ['USUARIO_EDITADO', admin.usuario.id, { campos: ['nombreCompleto', 'celular'] }],
        ['USUARIO_DESACTIVADO', admin.usuario.id, {}],
        ['USUARIO_REACTIVADO', admin.usuario.id, {}],
        ['ROL_QUITADO', admin.usuario.id, { rol: 'CAJA' }],
        ['ROL_ASIGNADO', admin.usuario.id, { rol: 'EVALUADOR' }],
        ['CLAVE_TEMPORAL_ASIGNADA', admin.usuario.id, {}],
      ]);
      const texto = JSON.stringify(filas.map((f) => [f.detalle, f.objeto]));
      for (const dato of ['gestion.009', '987650009', '912340009', 'Corregida', 'Temporal2026x']) {
        expect(texto).not.toContain(dato);
      }
    });

    it('si la regla del último administrador rechaza el cambio, no queda auditoría', async () => {
      const antes = await eventos({
        afectado_usuario_id: admin.usuario.id,
        accion: 'USUARIO_DESACTIVADO',
      });

      await admin.pedir('patch', `/usuarios/${admin.usuario.id}`, { activo: false }).expect(409);

      expect(
        await eventos({ afectado_usuario_id: admin.usuario.id, accion: 'USUARIO_DESACTIVADO' }),
      ).toHaveLength(antes.length);
    });
  });

  describe('configuración (por la cola de eventos)', () => {
    it('recetas y feriados llegan a la auditoría con el administrador y el objeto', async () => {
      const receta = await prisma.receta.findUniqueOrThrow({ where: { codigo: 'LIC-06' } });
      const tasa = (Number(receta.tasa) + 1).toFixed(2);
      await admin.pedir('put', '/catalogo/recetas/LIC-06', { tasa }).expect(200);
      await admin.pedir('put', '/catalogo/recetas/LIC-06', { activa: false }).expect(200);
      await admin.pedir('put', '/catalogo/recetas/LIC-06', { activa: true }).expect(200);
      const feriado = {
        fecha: '2031-06-24',
        descripcion: 'Feriado de prueba',
        alcance: 'REGIONAL',
      };
      await admin.pedir('post', '/feriados', feriado).expect(201);
      await admin.pedir('delete', '/feriados/2031-06-24').expect(204);

      await despachador.procesarPendientes();

      const filas = await eventos({
        actor_usuario_id: admin.usuario.id,
        objeto: { in: ['LIC-06', '2031-06-24'] },
      });
      expect(filas.map((f) => [f.accion, f.objeto, f.afectado_usuario_id])).toEqual([
        ['RECETA_ACTUALIZADA', 'LIC-06', null],
        ['RECETA_DESACTIVADA', 'LIC-06', null],
        ['RECETA_REACTIVADA', 'LIC-06', null],
        ['FERIADO_REGISTRADO', '2031-06-24', null],
        ['FERIADO_ELIMINADO', '2031-06-24', null],
      ]);
      expect(filas.every((f) => f.evento_origen_id !== null)).toBe(true);
    });

    it('el mismo evento entregado dos veces aparece una sola vez (idempotencia)', async () => {
      await admin
        .pedir('post', '/feriados', {
          fecha: '2031-07-01',
          descripcion: 'Repetido',
          alcance: 'REGIONAL',
        })
        .expect(201);
      await despachador.procesarPendientes();
      const [evento] = await prisma.evento_pendiente.findMany({
        where: { tipo: 'FeriadoRegistrado' },
        orderBy: { id: 'desc' },
        take: 1,
      });
      expect(evento?.procesado_en).not.toBeNull();

      // Simula una segunda entrega ("al menos una vez").
      await prisma.evento_pendiente.update({
        where: { id: evento?.id ?? 0n },
        data: { procesado_en: null },
      });
      await despachador.procesarPendientes();

      expect(await eventos({ evento_origen_id: evento?.id ?? 0n })).toHaveLength(1);
      await admin.pedir('delete', '/feriados/2031-07-01').expect(204);
      await despachador.procesarPendientes();
    });
  });

  describe('consulta', () => {
    let persona: UsuarioDePrueba;

    beforeAll(async () => {
      persona = await crearUsuarioDePrueba(prisma);
      for (let i = 0; i < 3; i += 1) {
        await intentar(persona.correo, 'Equivocada2026', `10.9.3.${String(i)}`);
      }
      await iniciarSesionDePrueba(app, redis, persona);
    });

    it('lista paginada de la más reciente a la más antigua, según el contrato', async () => {
      const respuesta = await admin
        .pedir('get', `/admin/auditoria?afectadoId=${persona.id}`)
        .expect(200);
      await esperarCumpleContrato('get', '/admin/auditoria', respuesta);

      const cuerpo = respuesta.body as {
        total: number;
        datos: { id: string; accion: string; textoAccion: string; afectado: { nombre: string } }[];
      };
      expect(cuerpo.total).toBe(4);
      expect(cuerpo.datos.map((d) => d.accion)).toEqual([
        'INGRESO_CORRECTO',
        'CLAVE_INCORRECTA',
        'CLAVE_INCORRECTA',
        'CLAVE_INCORRECTA',
      ]);
      expect(cuerpo.datos[1]?.textoAccion).toBe('Clave incorrecta');
      expect(cuerpo.datos[0]?.afectado.nombre).toBe(persona.nombre);
      expect(respuesta.headers['cache-control']).toBe('no-store');
    });

    it('la paginación es estable: sin repetir ni saltar eventos', async () => {
      const ids: string[] = [];
      for (let pagina = 1; pagina <= 4; pagina += 1) {
        const respuesta = await admin
          .pedir(
            'get',
            `/admin/auditoria?afectadoId=${persona.id}&porPagina=1&pagina=${String(pagina)}`,
          )
          .expect(200);
        ids.push(...(respuesta.body as { datos: { id: string }[] }).datos.map((d) => d.id));
      }
      expect(new Set(ids).size).toBe(4);
      expect([...ids].sort((a, b) => Number(b) - Number(a))).toEqual(ids);
    });

    it('filtra por acción y descarga el CSV con las mismas filas', async () => {
      const filtro = `afectadoId=${persona.id}&accion=CLAVE_INCORRECTA`;
      const lista = await admin.pedir('get', `/admin/auditoria?${filtro}`).expect(200);
      expect((lista.body as { total: number }).total).toBe(3);

      const csv = await admin.pedir('get', `/admin/auditoria?${filtro}&formato=csv`).expect(200);

      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['x-auditoria-truncada']).toBe('false');
      expect(csv.headers['content-disposition']).toMatch(
        /^attachment; filename="auditoria-seguridad-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      const lineas = csv.text.replace(/^﻿/, '').trim().split('\r\n');
      expect(lineas[0]).toBe('fecha;accion;actor;afectado;objeto;resultado');
      expect(lineas).toHaveLength(4);
      expect(lineas.slice(1).every((l) => l.includes(';Clave incorrecta;Sin sesión;'))).toBe(true);
      expect(csv.text).not.toContain(persona.correo);
    });

    it('rechaza con 422 un rango invertido, una acción desconocida o un id que no es uuid', async () => {
      for (const consulta of [
        'desde=2026-11-20&hasta=2026-11-01',
        'desde=2024-01-01&hasta=2026-01-01',
        'accion=BORRAR_TODO',
        'actorId=ana@correo.pe',
      ]) {
        const respuesta = await admin.pedir('get', `/admin/auditoria?${consulta}`);
        expect(respuesta.status).toBe(422);
        await esperarCumpleContrato('get', '/admin/auditoria', respuesta);
        expect(JSON.stringify(respuesta.body)).not.toContain('ana@correo.pe');
      }
    });
  });

  describe('solo de agregar (FR-012)', () => {
    it('la base rechaza modificar o borrar un evento', async () => {
      const [cualquiera] = await eventos({ actor_usuario_id: admin.usuario.id });
      const id = cualquiera?.id ?? 0n;

      await expect(
        prisma.$executeRaw`UPDATE seguridad.auditoria SET resultado = 'RECHAZADO' WHERE id = ${id}`,
      ).rejects.toThrow();
      await expect(
        prisma.$executeRaw`DELETE FROM seguridad.auditoria WHERE id = ${id}`,
      ).rejects.toThrow();
      await expect(prisma.$executeRaw`TRUNCATE seguridad.auditoria`).rejects.toThrow();
      expect(await eventos({ id })).toHaveLength(1);
    });
  });
});
