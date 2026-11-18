import type Redis from 'ioredis';
import { Correo } from '../../../../../src/modulos/seguridad/dominio/correo';
import { ErrorLimitadorNoDisponible } from '../../../../../src/modulos/seguridad/dominio/puertos/limitador-intentos';
import type { ProtectorDatos } from '../../../../../src/modulos/seguridad/dominio/puertos/protector-datos';
import { LimitadorIntentosRedis } from '../../../../../src/modulos/seguridad/infraestructura/limitador-intentos-redis';

/** HMAC falso: los bytes del texto, para poder leer la clave en hexadecimal. */
const protector = {
  hmac: (texto: string) => new TextEncoder().encode(texto),
} as unknown as ProtectorDatos;
const hex = (texto: string) => Buffer.from(texto).toString('hex');

/** Redis en memoria con lo que usa el limitador (MULTI, INCR, EXPIRE NX, GET, TTL). */
const redisFalso = (falla = false) => {
  const valores = new Map<string, number>();
  const ttls = new Map<string, number>();
  const comandos: unknown[][] = [];
  const fallar = <T>(valor: T) =>
    falla ? Promise.reject(new Error('redis caído')) : Promise.resolve(valor);

  const lote = () => {
    const pendientes: (() => unknown)[] = [];
    const api = {
      incr: (clave: string) => {
        comandos.push(['incr', clave]);
        pendientes.push(() => {
          valores.set(clave, (valores.get(clave) ?? 0) + 1);
          return valores.get(clave);
        });
        return api;
      },
      expire: (clave: string, segundos: number, modo: string) => {
        comandos.push(['expire', clave, segundos, modo]);
        pendientes.push(() => {
          if (modo === 'NX' && ttls.has(clave)) {
            return 0;
          }
          ttls.set(clave, segundos);
          return 1;
        });
        return api;
      },
      get: (clave: string) => {
        pendientes.push(() => {
          const valor = valores.get(clave);
          return valor === undefined ? null : String(valor);
        });
        return api;
      },
      ttl: (clave: string) => {
        pendientes.push(() => ttls.get(clave) ?? -2);
        return api;
      },
      exec: () => fallar(pendientes.map((ejecutar) => [null, ejecutar()])),
    };
    return api;
  };

  const redis = { multi: lote, pipeline: lote } as unknown as Redis;
  return { redis, valores, ttls, comandos };
};

const correo = Correo.crear('persona@ejemplo.pe');

describe('LimitadorIntentosRedis (research.md §R-08)', () => {
  it('registra el fallo en las claves del correo (HMAC) y de la IP, con EXPIRE 900 NX en un MULTI', async () => {
    const { redis, comandos } = redisFalso();

    await new LimitadorIntentosRedis(redis, protector).registrarFallo(correo, '10.0.0.7');

    expect(comandos).toEqual([
      ['incr', `lim:fallos:correo:${hex('persona@ejemplo.pe')}`],
      ['expire', `lim:fallos:correo:${hex('persona@ejemplo.pe')}`, 900, 'NX'],
      ['incr', 'lim:fallos:ip:10.0.0.7'],
      ['expire', 'lim:fallos:ip:10.0.0.7', 900, 'NX'],
    ]);
  });

  it('nunca usa el correo en claro en las claves', async () => {
    const { redis, valores } = redisFalso();

    await new LimitadorIntentosRedis(redis, protector).registrarFallo(correo, '10.0.0.7');

    expect([...valores.keys()].join(' ')).not.toContain('persona@ejemplo.pe');
  });

  it('el TTL se fija solo la primera vez (ventana fija de 15 minutos)', async () => {
    const { redis, ttls } = redisFalso();
    const limitador = new LimitadorIntentosRedis(redis, protector);
    await limitador.registrarFallo(null, '10.0.0.7');
    ttls.set('lim:fallos:ip:10.0.0.7', 120);

    await limitador.registrarFallo(null, '10.0.0.7');

    expect(ttls.get('lim:fallos:ip:10.0.0.7')).toBe(120);
  });

  it('con menos de 5 fallos no está bloqueado; con 5, sí, con el TTL restante', async () => {
    const { redis, ttls } = redisFalso();
    const limitador = new LimitadorIntentosRedis(redis, protector);
    for (let i = 0; i < 4; i += 1) {
      await limitador.registrarFallo(correo, '10.0.0.7');
    }
    await expect(limitador.consultarFallos(correo, '10.0.0.7')).resolves.toEqual({
      bloqueado: false,
      segundosRestantes: 0,
    });

    await limitador.registrarFallo(correo, '10.0.0.7');
    ttls.set(`lim:fallos:correo:${hex('persona@ejemplo.pe')}`, 612);

    await expect(limitador.consultarFallos(correo, '10.0.0.7')).resolves.toEqual({
      bloqueado: true,
      segundosRestantes: 900,
    });
    ttls.set('lim:fallos:ip:10.0.0.7', 300);
    await expect(limitador.consultarFallos(correo, '10.0.0.7')).resolves.toEqual({
      bloqueado: true,
      segundosRestantes: 612,
    });
  });

  it('5 fallos desde la misma IP bloquean otros correos (FR-007)', async () => {
    const { redis } = redisFalso();
    const limitador = new LimitadorIntentosRedis(redis, protector);
    for (let i = 0; i < 5; i += 1) {
      await limitador.registrarFallo(Correo.crear(`p${String(i)}@ejemplo.pe`), '10.0.0.7');
    }

    await expect(limitador.consultarFallos(correo, '10.0.0.7')).resolves.toMatchObject({
      bloqueado: true,
    });
    await expect(limitador.consultarFallos(correo, '10.0.0.8')).resolves.toMatchObject({
      bloqueado: false,
    });
  });

  it('cuenta los envíos de código por usuario y bloquea con 3 (FR-002a)', async () => {
    const { redis, comandos } = redisFalso();
    const limitador = new LimitadorIntentosRedis(redis, protector);
    for (let i = 0; i < 3; i += 1) {
      await limitador.registrarEnvio('u-1');
    }

    expect(comandos[0]).toEqual(['incr', 'lim:envios:usuario:u-1']);
    await expect(limitador.consultarEnvios('u-1')).resolves.toMatchObject({ bloqueado: true });
    await expect(limitador.consultarEnvios('u-2')).resolves.toMatchObject({ bloqueado: false });
  });

  it('si Redis falla lanza ErrorLimitadorNoDisponible', async () => {
    const { redis } = redisFalso(true);
    const limitador = new LimitadorIntentosRedis(redis, protector);

    await expect(limitador.consultarFallos(correo, '10.0.0.7')).rejects.toBeInstanceOf(
      ErrorLimitadorNoDisponible,
    );
    await expect(limitador.registrarFallo(correo, '10.0.0.7')).rejects.toBeInstanceOf(
      ErrorLimitadorNoDisponible,
    );
    await expect(limitador.consultarEnvios('u-1')).rejects.toBeInstanceOf(
      ErrorLimitadorNoDisponible,
    );
    await expect(limitador.registrarEnvio('u-1')).rejects.toBeInstanceOf(
      ErrorLimitadorNoDisponible,
    );
  });
});
