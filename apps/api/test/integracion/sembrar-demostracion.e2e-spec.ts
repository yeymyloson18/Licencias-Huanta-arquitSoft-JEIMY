import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import type Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import {
  CODIGO_OK,
  CODIGO_SALIDA_EN_PRODUCCION,
  ejecutarSiembra,
  type UsuarioDemostracion,
} from '../../src/scripts/sembrar-demostracion';
import { crearAplicacionDePrueba, type LoggerCapturador } from '../apoyo/aplicacion-prueba';
import { limpiarTramites } from '../apoyo/expedientes-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { limpiarClavesSeguridad } from '../apoyo/redis-prueba';

// FR-039 de la 007: datos de demostración idempotentes, con claves mostradas una sola vez. Datos
// FICTICIOS.

describe('Comando sembrar-demostracion (007)', () => {
  let app: INestApplication<App>;
  let logger: LoggerCapturador;
  let redis: Redis;
  let prisma: PrismaServicio;

  /** El comando cierra su contexto al terminar; aquí se comparte la app de la prueba. */
  const contexto = (): Promise<INestApplicationContext> =>
    Promise.resolve({
      get: app.get.bind(app),
      close: () => Promise.resolve(),
    } as unknown as INestApplicationContext);

  const ejecutar = async (argv: string[], env: Record<string, string> = {}) => {
    const salida: string[] = [];
    const codigo = await ejecutarSiembra({
      argv,
      env,
      escribir: (texto) => salida.push(texto),
      crearContexto: contexto,
    });
    return { codigo, salida: salida.join('') };
  };

  beforeAll(async () => {
    const creada = await crearAplicacionDePrueba();
    app = creada.app as INestApplication<App>;
    logger = creada.logger;
    redis = app.get<Redis>(REDIS_CLIENTE);
    prisma = app.get(PrismaServicio);
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await limpiarTramites(prisma);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('crea un usuario por rol con clave y 3 expedientes; las claves sirven para ingresar', async () => {
    const { codigo, salida } = await ejecutar(['--salida', '-']);

    expect(codigo).toBe(CODIGO_OK);
    const datos = JSON.parse(salida) as { usuarios: UsuarioDemostracion[]; expedientes: string[] };
    expect(datos.usuarios.map((u) => u.rol)).toEqual([
      'MESA_PARTES',
      'EVALUADOR',
      'INSPECTOR',
      'CAJA',
      'JEFATURA',
      'ADMINISTRADOR',
    ]);
    expect(datos.usuarios.every((u) => /^Demo[A-Za-z0-9_-]{12}7$/.test(u.clave ?? ''))).toBe(true);
    expect(datos.expedientes).toHaveLength(3);
    const caja = datos.usuarios.find((u) => u.rol === 'CAJA');
    const ingreso = await request(app.getHttpServer())
      .post('/api/v1/auth/iniciar-sesion')
      .set('X-Forwarded-For', '198.51.100.71')
      .send({ correo: caja?.correo, clave: caja?.clave });
    expect(ingreso.status).toBe(200);
    for (const usuario of datos.usuarios) {
      expect(logger.lineas.join('\n')).not.toContain(usuario.clave ?? 'sin-clave');
    }
  });

  it('otra vez no duplica nada ni muestra claves; con --regenerar pone claves nuevas', async () => {
    const antes = await prisma.usuario.count();

    const repetida = await ejecutar([]);
    const regenerada = await ejecutar(['--regenerar', '--salida', '-']);

    expect(repetida.codigo).toBe(CODIGO_OK);
    expect(repetida.salida).toContain('(ya existía; use --regenerar)');
    expect(repetida.salida).toContain('Los expedientes de ejemplo ya existían.');
    expect(await prisma.usuario.count()).toBe(antes);
    expect(await prisma.expediente.count({ where: { nombre_comercial: 'Demostración' } })).toBe(3);
    const nuevos = JSON.parse(regenerada.salida) as { usuarios: UsuarioDemostracion[] };
    expect(nuevos.usuarios.every((u) => u.clave !== null)).toBe(true);
  });

  it('en producción --salida se rechaza sin tocar la base', async () => {
    const antes = await prisma.usuario.count();

    const { codigo, salida } = await ejecutar(['--salida', '-'], { NODE_ENV: 'production' });

    expect(codigo).toBe(CODIGO_SALIDA_EN_PRODUCCION);
    expect(salida).toContain('solo se permite fuera de producción');
    expect(await prisma.usuario.count()).toBe(antes);
  });
});
