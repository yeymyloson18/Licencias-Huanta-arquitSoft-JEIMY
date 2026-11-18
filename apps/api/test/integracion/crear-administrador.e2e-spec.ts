import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { ejecutarCrearAdministrador } from '../../src/modulos/seguridad/presentacion/cli/crear-administrador';
import { crearAplicacionDePrueba } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { iniciarSesionDePrueba } from '../apoyo/sesion-prueba';

// Historia 3 (FR-023, FR-024; contracts/crear-administrador.md).

const DATOS = {
  ADMIN_CORREO: 'primer.admin@ejemplo.pe',
  ADMIN_NOMBRE: 'Administración de Prueba',
  ADMIN_CELULAR: '987654321',
  ADMIN_CLAVE: 'ClaveInicialDePrueba2026',
};

/** Ejecuta el comando con las variables dadas y captura lo que escribe. */
const ejecutar = async (variables: Readonly<Record<string, string>>, esTerminal = false) => {
  const salida: string[] = [];
  const errores: string[] = [];
  const codigo = await ejecutarCrearAdministrador({
    env: variables,
    esTerminal,
    escribir: (texto) => salida.push(texto),
    escribirError: (texto) => errores.push(texto),
  });
  return { codigo, salida: salida.join(''), errores: errores.join('') };
};

const sinDatosPersonales = (texto: string) => {
  for (const valor of [DATOS.ADMIN_CORREO, DATOS.ADMIN_CELULAR, DATOS.ADMIN_CLAVE]) {
    expect(texto).not.toContain(valor);
  }
};

describe('Comando crear-administrador', () => {
  let app: INestApplication<App>;
  let prisma: PrismaServicio;
  let redis: Redis;

  beforeAll(async () => {
    ({ app } = (await crearAplicacionDePrueba()) as { app: INestApplication<App> });
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
  });

  beforeEach(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('crea el primer administrador, que puede iniciar sesión, y no repite si ya existe', async () => {
    const primera = await ejecutar(DATOS);

    expect(primera.codigo).toBe(0);
    const id =
      /Administrador creado\. Id: ([0-9a-f-]{36})\. Deberá cambiar la clave en su primer ingreso\./.exec(
        primera.salida,
      )?.[1];
    expect(id).toBeDefined();
    sinDatosPersonales(primera.salida + primera.errores);

    const fila = await prisma.usuario.findUniqueOrThrow({
      where: { id },
      include: { usuario_rol: true },
    });
    expect(fila.activo).toBe(true);
    expect(fila.debe_cambiar_clave).toBe(true);
    expect(fila.usuario_rol.map((r) => r.rol_codigo)).toEqual(['ADMINISTRADOR']);

    const sesion = await iniciarSesionDePrueba(app, redis, {
      id: id ?? '',
      correo: DATOS.ADMIN_CORREO,
      clave: DATOS.ADMIN_CLAVE,
      celular: DATOS.ADMIN_CELULAR,
      nombre: DATOS.ADMIN_NOMBRE,
    });
    expect(sesion.accessToken.length).toBeGreaterThan(0);

    const segunda = await ejecutar({ ...DATOS, ADMIN_CORREO: 'otro.admin@ejemplo.pe' });
    expect(segunda.codigo).toBe(0);
    expect(segunda.salida).toContain(
      'Ya existe un administrador activo; no se hizo ningún cambio.',
    );
    await expect(prisma.usuario.count()).resolves.toBe(1);
    await expect(prisma.usuario_rol.count()).resolves.toBe(1);
  });

  it('sin terminal y con variables faltantes termina con código 2 y las nombra', async () => {
    const resultado = await ejecutar({ ADMIN_CORREO: DATOS.ADMIN_CORREO });

    expect(resultado.codigo).toBe(2);
    expect(resultado.errores).toContain(
      'Faltan variables: ADMIN_NOMBRE, ADMIN_CELULAR, ADMIN_CLAVE',
    );
    sinDatosPersonales(resultado.salida + resultado.errores);
    await expect(prisma.usuario.count()).resolves.toBe(0);
  });

  it('con datos inválidos termina con código 2 y nombra los campos, sin sus valores', async () => {
    const resultado = await ejecutar({ ...DATOS, ADMIN_CELULAR: '12345', ADMIN_CLAVE: 'corta' });

    expect(resultado.codigo).toBe(2);
    expect(resultado.errores).toMatch(/^Datos inválidos: .*celular.*clave/m);
    expect(resultado.errores).not.toContain('12345');
    expect(resultado.errores).not.toContain('corta');
  });

  it('con el correo de otro usuario termina con código 1', async () => {
    await prisma.usuario.deleteMany();
    const otro = await ejecutar({ ...DATOS });
    expect(otro.codigo).toBe(0);
    // El administrador existente se desactiva para que el comando vuelva a intentar crear uno.
    await prisma.usuario.updateMany({ data: { activo: false } });

    const repetido = await ejecutar(DATOS);

    expect(repetido.codigo).toBe(1);
    expect(repetido.errores).toContain('El correo ya está en uso.');
  });
});
