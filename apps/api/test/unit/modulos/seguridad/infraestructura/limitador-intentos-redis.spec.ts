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

/**
 * Redis en memoria con lo que usa el limitador: MULTI (INCR, EXPIRE NX, TTL) y EVAL del script de
 * liberación (decrementa solo las claves que existen).
 */
const redisFalso = (falla = false) => {
  const valores = new Map<string, number>();
  const ttls = new Map<string, number>();
  const comandos: unknown[][] = [];
  const fallar = <T>(valor: T) =>
    falla ? Promise.reject(new Error('redis caído')) : Promise.resolve(valor);

  const multi = () => {
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
      ttl: (clave: string) => {
        comandos.push(['ttl', clave]);
        pendientes.push(() => ttls.get(clave) ?? -2);
        return api;
      },
      exec: () => fallar(pendientes.map((ejecutar) => [null, ejecutar()])),
    };
    return api;
  };

  const evaluar = (_script: string, cantidad: number, ...claves: string[]) => {
    comandos.push(['eval', cantidad, ...claves]);
    if (!falla) {
      for (const clave of claves) {
        const valor = valores.get(clave);
        if (valor !== undefined) {
          valores.set(clave, valor - 1);
        }
      }
    }
    return fallar(0);
  };

  const redis = { multi, eval: evaluar } as unknown as Redis;
  return { redis, valores, ttls, comandos };
};

const correo = Correo.crear('persona@ejemplo.pe');
const claveCorreo = `lim:fallos:correo:${hex('persona@ejemplo.pe')}`;

describe('LimitadorIntentosRedis (research.md §R-08)', () => {
  it('reserva el intento en las claves del correo (HMAC) y de la IP en un solo MULTI', async () => {
    const { redis, comandos } = redisFalso();

    await new LimitadorIntentosRedis(redis, protector).reservarIntento(correo, '10.0.0.7');

    expect(comandos).toEqual([
      ['incr', claveCorreo],
      ['expire', claveCorreo, 900, 'NX'],
      ['ttl', claveCorreo],
      ['incr', 'lim:fallos:ip:10.0.0.7'],
      ['expire', 'lim:fallos:ip:10.0.0.7', 900, 'NX'],
      ['ttl', 'lim:fallos:ip:10.0.0.7'],
    ]);
  });

  it('nunca usa el correo en claro en las claves', async () => {
    const { redis, valores } = redisFalso();

    await new LimitadorIntentosRedis(redis, protector).reservarIntento(correo, '10.0.0.7');

    expect([...valores.keys()].join(' ')).not.toContain('persona@ejemplo.pe');
  });

  it('el TTL se fija solo con el primer intento (ventana fija de 15 minutos)', async () => {
    const { redis, ttls } = redisFalso();
    const limitador = new LimitadorIntentosRedis(redis, protector);
    await limitador.reservarIntento(null, '10.0.0.7');
    ttls.set('lim:fallos:ip:10.0.0.7', 120);

    await limitador.reservarIntento(null, '10.0.0.7');

    expect(ttls.get('lim:fallos:ip:10.0.0.7')).toBe(120);
  });

  it('permite las 5 primeras reservas y rechaza la 6.ª con el TTL restante', async () => {
    const { redis, ttls } = redisFalso();
    const limitador = new LimitadorIntentosRedis(redis, protector);
    for (let i = 0; i < 5; i += 1) {
      await expect(limitador.reservarIntento(correo, '10.0.0.7')).resolves.toEqual({
        permitido: true,
        segundosRestantes: 0,
      });
    }
    ttls.set(claveCorreo, 612);
    ttls.set('lim:fallos:ip:10.0.0.7', 300);

    await expect(limitador.reservarIntento(correo, '10.0.0.7')).resolves.toEqual({
      permitido: false,
      segundosRestantes: 612,
    });
  });

  it('el valor de cada INCR ya incluye la reserva: de 20 reservas simultáneas pasan solo 5', async () => {
    const { redis } = redisFalso();
    const limitador = new LimitadorIntentosRedis(redis, protector);

    const resultados = await Promise.all(
      Array.from({ length: 20 }, () => limitador.reservarIntento(correo, '10.0.0.7')),
    );

    expect(resultados.filter((r) => r.permitido)).toHaveLength(5);
  });

  it('liberar devuelve la reserva en las dos claves con un script atómico', async () => {
    const { redis, valores, comandos } = redisFalso();
    const limitador = new LimitadorIntentosRedis(redis, protector);
    await limitador.reservarIntento(correo, '10.0.0.7');

    await limitador.liberarIntento(correo, '10.0.0.7');

    expect(comandos.at(-1)).toEqual(['eval', 2, claveCorreo, 'lim:fallos:ip:10.0.0.7']);
    expect(valores.get(claveCorreo)).toBe(0);
    expect(valores.get('lim:fallos:ip:10.0.0.7')).toBe(0);
  });

  it('5 intentos fallidos desde la misma IP bloquean otros correos (FR-007)', async () => {
    const { redis } = redisFalso();
    const limitador = new LimitadorIntentosRedis(redis, protector);
    for (let i = 0; i < 5; i += 1) {
      await limitador.reservarIntento(Correo.crear(`p${String(i)}@ejemplo.pe`), '10.0.0.7');
    }

    await expect(limitador.reservarIntento(correo, '10.0.0.7')).resolves.toMatchObject({
      permitido: false,
    });
    await expect(limitador.reservarIntento(correo, '10.0.0.8')).resolves.toMatchObject({
      permitido: true,
    });
  });

  it('reserva los envíos de código por usuario: pasan 3, el 4.º no (FR-002a)', async () => {
    const { redis, comandos } = redisFalso();
    const limitador = new LimitadorIntentosRedis(redis, protector);
    for (let i = 0; i < 3; i += 1) {
      await expect(limitador.reservarEnvio('u-1')).resolves.toMatchObject({ permitido: true });
    }

    expect(comandos[0]).toEqual(['incr', 'lim:envios:usuario:u-1']);
    await expect(limitador.reservarEnvio('u-1')).resolves.toMatchObject({ permitido: false });
    await expect(limitador.reservarEnvio('u-2')).resolves.toMatchObject({ permitido: true });

    await limitador.liberarEnvio('u-2');
    expect(comandos.at(-1)).toEqual(['eval', 1, 'lim:envios:usuario:u-2']);
  });

  it('si Redis falla lanza ErrorLimitadorNoDisponible', async () => {
    const { redis } = redisFalso(true);
    const limitador = new LimitadorIntentosRedis(redis, protector);

    await expect(limitador.reservarIntento(correo, '10.0.0.7')).rejects.toBeInstanceOf(
      ErrorLimitadorNoDisponible,
    );
    await expect(limitador.liberarIntento(correo, '10.0.0.7')).rejects.toBeInstanceOf(
      ErrorLimitadorNoDisponible,
    );
    await expect(limitador.reservarEnvio('u-1')).rejects.toBeInstanceOf(ErrorLimitadorNoDisponible);
    await expect(limitador.liberarEnvio('u-1')).rejects.toBeInstanceOf(ErrorLimitadorNoDisponible);
  });
});
