import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { PrismaServicio } from '../../src/compartido/infraestructura/prisma.servicio';
import { REDIS_CLIENTE } from '../../src/compartido/infraestructura/redis.proveedor';
import { crearAplicacionDePrueba, type LoggerCapturador } from '../apoyo/aplicacion-prueba';
import { limpiarSeguridad } from '../apoyo/limpiar-seguridad';
import { leerOtpSimulado, limpiarClavesSeguridad } from '../apoyo/redis-prueba';
import { iniciarSesionDePrueba } from '../apoyo/sesion-prueba';
import { crearUsuarioDePrueba } from '../apoyo/usuarios-prueba';

// SC-007 / FR-028 / FR-029 / principio VII: los datos personales y los secretos no se filtran por
// respuestas, URLs, cabeceras ni logs, y en la base quedan cifrados o como huella argon2id.
//
// Qué se prohíbe y dónde:
// - El celular completo, las claves, los códigos y el refresh token: en ninguna respuesta (cuerpo
//   ni cabeceras; el refresh token solo puede viajar en Set-Cookie), URL ni línea del logger.
// - El correo y el nombre: en ninguna respuesta de error, URL, cabecera ni línea del logger. Sí
//   pueden aparecer en las respuestas 2xx que existen para mostrarlos (la ficha del usuario al
//   administrador y la sesión al propio usuario).

interface Intercambio {
  readonly url: string;
  readonly respuesta: Response;
}

const IP = '198.51.100.77';

describe('Datos personales fuera de respuestas, URLs y logs (SC-007)', () => {
  let app: INestApplication<App>;
  let logger: LoggerCapturador;
  let prisma: PrismaServicio;
  let redis: Redis;
  const intercambios: Intercambio[] = [];

  const sufijo = randomUUID().slice(0, 8);
  const persona = {
    correo: `persona.sc007.${sufijo}@ejemplo.pe`,
    nombre: `Persona Confidencial ${sufijo}`,
    nombreNuevo: `Persona Renombrada ${sufijo}`,
    celular: '944556677',
    celularNuevo: '955667788',
    claveTemporal: `ClaveTemporal${sufijo}A1`,
    claveDefinitiva: `ClaveDefinitiva${sufijo}B2`,
    claveTemporal2: `ClaveReasignada${sufijo}C3`,
    claveErrada: `ClaveErrada${sufijo}D4`,
  };
  const codigos: string[] = [];
  const refreshTokens: string[] = [];

  const pedir = async (
    metodo: 'get' | 'post' | 'patch' | 'put',
    ruta: string,
    opciones: { token?: string; cookie?: string; cuerpo?: object } = {},
  ): Promise<Response> => {
    const url = `/api/v1${ruta}`;
    let peticion = request(app.getHttpServer())[metodo](url).set('X-Forwarded-For', IP);
    if (opciones.token !== undefined) {
      peticion = peticion.set('Authorization', `Bearer ${opciones.token}`);
    }
    if (opciones.cookie !== undefined) {
      peticion = peticion.set('Cookie', opciones.cookie);
    }
    const respuesta = await (opciones.cuerpo === undefined
      ? peticion
      : peticion.send(opciones.cuerpo));
    intercambios.push({ url, respuesta });
    return respuesta;
  };

  const refreshDe = (respuesta: Response): string => {
    const cabecera = respuesta.headers['set-cookie'] as unknown as string[] | undefined;
    const valor =
      cabecera
        ?.find((linea) => linea.startsWith('refresh_personal='))
        ?.split(';')[0]
        ?.slice('refresh_personal='.length) ?? '';
    if (valor !== '') {
      refreshTokens.push(valor);
    }
    return valor;
  };

  /** Inicia sesión por el flujo real registrando cada respuesta y el código usado. */
  const ingresar = async (usuarioId: string, clave: string) => {
    const paso1 = await pedir('post', '/auth/iniciar-sesion', {
      cuerpo: { correo: persona.correo, clave },
    });
    expect(paso1.status).toBe(200);
    const { desafioId } = paso1.body as { desafioId: string };
    const codigo = await leerOtpSimulado(redis, usuarioId);
    codigos.push(codigo);
    const errado = codigo === '000000' ? '111111' : '000000';
    expect(
      (await pedir('post', '/auth/verificar-otp', { cuerpo: { desafioId, codigo: errado } }))
        .status,
    ).toBe(401);
    const paso2 = await pedir('post', '/auth/verificar-otp', { cuerpo: { desafioId, codigo } });
    expect(paso2.status).toBe(200);
    return {
      token: (paso2.body as { accessToken: string }).accessToken,
      refresh: refreshDe(paso2),
    };
  };

  beforeAll(async () => {
    const creada = await crearAplicacionDePrueba();
    app = creada.app as INestApplication<App>;
    logger = creada.logger;
    prisma = app.get(PrismaServicio);
    redis = app.get<Redis>(REDIS_CLIENTE);
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
  });

  afterAll(async () => {
    await limpiarSeguridad(prisma);
    await limpiarClavesSeguridad(redis);
    await app.close();
  });

  it('recorre todos los flujos de la 002 sin filtrar datos personales', async () => {
    // ---------------------------------------------------------------- administrador y alta
    const administrador = await crearUsuarioDePrueba(prisma, { roles: ['ADMINISTRADOR'] });
    const { accessToken: tokenAdmin } = await iniciarSesionDePrueba(app, redis, administrador);

    const invalida = await pedir('post', '/usuarios', {
      token: tokenAdmin,
      cuerpo: {
        correo: persona.correo,
        nombreCompleto: persona.nombre,
        celular: persona.celular,
        claveTemporal: 'corta',
        roles: ['CAJA'],
      },
    });
    expect(invalida.status).toBe(422);

    const alta = await pedir('post', '/usuarios', {
      token: tokenAdmin,
      cuerpo: {
        correo: persona.correo,
        nombreCompleto: persona.nombre,
        celular: persona.celular,
        claveTemporal: persona.claveTemporal,
        roles: ['CAJA'],
      },
    });
    expect(alta.status).toBe(201);
    const usuarioId = (alta.body as { id: string }).id;

    const repetida = await pedir('post', '/usuarios', {
      token: tokenAdmin,
      cuerpo: {
        correo: persona.correo.toUpperCase(),
        nombreCompleto: persona.nombre,
        celular: persona.celular,
        claveTemporal: persona.claveTemporal,
        roles: ['CAJA'],
      },
    });
    expect(repetida.status).toBe(409);

    // ---------------------------------------------------------------- inicio de sesión
    expect(
      (
        await pedir('post', '/auth/iniciar-sesion', {
          cuerpo: { correo: persona.correo, clave: persona.claveErrada },
        })
      ).status,
    ).toBe(401);
    const primera = await ingresar(usuarioId, persona.claveTemporal);

    // ---------------------------------------------------------------- cambio de clave
    expect(
      (
        await pedir('post', '/auth/cambiar-clave', {
          token: primera.token,
          cuerpo: { claveActual: persona.claveTemporal, claveNueva: 'corta' },
        })
      ).status,
    ).toBe(422);
    const cambio = await pedir('post', '/auth/cambiar-clave', {
      token: primera.token,
      cuerpo: { claveActual: persona.claveTemporal, claveNueva: persona.claveDefinitiva },
    });
    expect(cambio.status).toBe(200);
    const refreshCambio = refreshDe(cambio);
    const renovada = await pedir('post', '/auth/renovar', {
      cookie: `refresh_personal=${refreshCambio}`,
    });
    expect(renovada.status).toBe(200);
    refreshDe(renovada);

    // ---------------------------------------------------------------- edición y búsqueda
    expect(
      (
        await pedir('patch', `/usuarios/${usuarioId}`, {
          token: tokenAdmin,
          cuerpo: { celular: '12345' },
        })
      ).status,
    ).toBe(422);
    const edicion = await pedir('patch', `/usuarios/${usuarioId}`, {
      token: tokenAdmin,
      cuerpo: { nombreCompleto: persona.nombreNuevo, celular: persona.celularNuevo },
    });
    expect(edicion.status).toBe(200);

    const porCorreo = await pedir('post', '/usuarios/busqueda', {
      token: tokenAdmin,
      cuerpo: { texto: persona.correo },
    });
    expect(porCorreo.body).toMatchObject({ total: 1 });
    const porNombre = await pedir('post', '/usuarios/busqueda', {
      token: tokenAdmin,
      cuerpo: { texto: 'Renombrada' },
    });
    expect(porNombre.body).toMatchObject({ total: 1 });
    expect((await pedir('get', '/usuarios?activo=true', { token: tokenAdmin })).status).toBe(200);

    // ---------------------------------------------------------------- clave temporal
    expect(
      (
        await pedir('post', `/usuarios/${usuarioId}/clave-temporal`, {
          token: tokenAdmin,
          cuerpo: { claveTemporal: persona.claveTemporal2 },
        })
      ).status,
    ).toBe(204);
    // La sesión anterior quedó revocada.
    expect(
      (await pedir('post', '/auth/renovar', { cookie: `refresh_personal=${primera.refresh}` }))
        .status,
    ).toBe(401);

    // ---------------------------------------------------------------- fuerza bruta
    let ultimo: Response | undefined;
    for (let intento = 0; intento < 6; intento += 1) {
      ultimo = await pedir('post', '/auth/iniciar-sesion', {
        cuerpo: { correo: persona.correo, clave: `${persona.claveErrada}${String(intento)}` },
      });
    }
    expect(ultimo?.status).toBe(429);

    // ================================================================ verificaciones
    const secretos = [
      persona.celular,
      persona.celularNuevo,
      persona.claveTemporal,
      persona.claveDefinitiva,
      persona.claveTemporal2,
      persona.claveErrada,
      ...codigos,
      ...refreshTokens,
    ].filter((valor) => valor !== '');
    expect(codigos.length).toBeGreaterThan(0);
    expect(refreshTokens.length).toBeGreaterThanOrEqual(3);
    const identificadores = [
      persona.correo,
      persona.correo.toUpperCase(),
      persona.nombre,
      persona.nombreNuevo,
    ];
    const todos = [...secretos, ...identificadores];
    const contiene = (texto: string, valores: readonly string[]) =>
      valores.filter((valor) => texto.toLowerCase().includes(valor.toLowerCase()));

    for (const { url, respuesta } of intercambios) {
      expect({ url, filtrados: contiene(url, todos) }).toEqual({ url, filtrados: [] });

      const cabeceras = Object.entries(respuesta.headers)
        .filter(([nombre]) => nombre !== 'set-cookie')
        .map(([nombre, valor]) => `${nombre}: ${String(valor)}`)
        .join('\n');
      expect({ url, filtrados: contiene(cabeceras, todos) }).toEqual({ url, filtrados: [] });

      const cuerpo = respuesta.text;
      const prohibidos = respuesta.status >= 400 ? todos : secretos;
      expect({ url, estado: respuesta.status, filtrados: contiene(cuerpo, prohibidos) }).toEqual({
        url,
        estado: respuesta.status,
        filtrados: [],
      });
    }

    for (const linea of logger.lineas) {
      expect({ linea, filtrados: contiene(linea, todos) }).toEqual({ linea, filtrados: [] });
    }

    // ---------------------------------------------------------------- en la base
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    const correoCifrado = Buffer.from(fila.correo_cifrado);
    const celularCifrado = Buffer.from(fila.celular_cifrado);
    expect(correoCifrado.includes(persona.correo)).toBe(false);
    expect(correoCifrado.includes(persona.correo.split('@')[0] ?? '')).toBe(false);
    expect(celularCifrado.includes(persona.celularNuevo)).toBe(false);
    expect(celularCifrado.includes(persona.celular)).toBe(false);
    expect(fila.clave_hash.startsWith('$argon2id$')).toBe(true);
    expect(fila.clave_hash).not.toContain(persona.claveTemporal2);
    // Recorre todos los flujos (unas diez operaciones argon2): más que los 5 s por defecto.
  }, 60_000);

  it('Mi perfil y el cambio de clave voluntario no filtran datos personales (011)', async () => {
    // La prueba anterior bloqueó esta IP por fuerza bruta: se limpian los contadores.
    await limpiarClavesSeguridad(redis);
    const claveNueva = `ClaveVoluntaria${sufijo}E5`;
    const usuario = await crearUsuarioDePrueba(prisma, { roles: ['JEFATURA'] });
    const desde = intercambios.length;
    const lineasAntes = logger.lineas.length;
    const { accessToken } = await iniciarSesionDePrueba(app, redis, usuario);

    const primero = await pedir('get', '/perfil', { token: accessToken });
    expect(primero.status).toBe(200);
    const cambio = await pedir('post', '/auth/cambiar-clave', {
      token: accessToken,
      cuerpo: { claveActual: usuario.clave, claveNueva },
    });
    expect(cambio.status).toBe(200);
    const tokenNuevo = (cambio.body as { accessToken: string }).accessToken;
    const errado = await pedir('post', '/auth/cambiar-clave', {
      token: tokenNuevo,
      cuerpo: { claveActual: usuario.clave, claveNueva: `${claveNueva}X` },
    });
    expect(errado.status).toBe(401);
    const segundo = await pedir('get', '/perfil', { token: tokenNuevo });
    expect(segundo.status).toBe(200);

    // La respuesta del perfil: sin id, huella ni celular, y ningún número de 9 dígitos seguidos.
    for (const respuesta of [primero, segundo]) {
      const cuerpo = respuesta.body as Record<string, unknown>;
      for (const clave of ['id', 'claveHash', 'celular']) {
        expect(cuerpo).not.toHaveProperty(clave);
      }
      expect(respuesta.text).not.toMatch(/\d{9}/);
    }

    const secretos = [usuario.celular, usuario.clave, claveNueva, `${claveNueva}X`];
    const todos = [...secretos, usuario.correo, usuario.nombre];
    const contiene = (texto: string, valores: readonly string[]) =>
      valores.filter((valor) => texto.toLowerCase().includes(valor.toLowerCase()));

    for (const { url, respuesta } of intercambios.slice(desde)) {
      expect({ url, filtrados: contiene(url, todos) }).toEqual({ url, filtrados: [] });
      const prohibidos = respuesta.status >= 400 ? todos : secretos;
      expect({ url, filtrados: contiene(respuesta.text, prohibidos) }).toEqual({
        url,
        filtrados: [],
      });
    }
    for (const linea of logger.lineas.slice(lineasAntes)) {
      expect({ linea, filtrados: contiene(linea, todos) }).toEqual({ linea, filtrados: [] });
    }
  }, 60_000);
});
