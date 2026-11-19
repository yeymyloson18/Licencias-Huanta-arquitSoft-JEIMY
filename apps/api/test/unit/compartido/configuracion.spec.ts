import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cargarConfiguracion,
  ErrorConfiguracion,
} from '../../../src/compartido/infraestructura/configuracion';

const secreto = 'clave_muy_secreta';
const aBase64 = (texto: string): string => Buffer.from(texto).toString('base64');

// Claves distintas de las de .env.example (las de ejemplo están prohibidas en producción).
const claves = {
  JWT_SECRETO: 'jwt-de-prueba-unitaria-con-mas-de-32-bytes',
  CLAVE_CIFRADO_DATOS: aBase64('0123456789abcdef0123456789abcdef'),
  CLAVE_HMAC_DATOS: aBase64('hmac-de-prueba-unitaria-con-32-bytes!'),
};

const base = {
  DATABASE_URL: `postgresql://licencias:${secreto}@localhost:5432/licencias`,
  REDIS_URL: 'redis://localhost:6379',
  ...claves,
};

const mensajeDe = (accion: () => unknown): string => {
  try {
    accion();
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorConfiguracion);
    return (error as Error).message;
  }
  throw new Error('Se esperaba ErrorConfiguracion');
};

describe('cargarConfiguracion', () => {
  it('aplica los valores por defecto', () => {
    const configuracion = cargarConfiguracion(base);

    expect(configuracion).toMatchObject({
      urlBaseDeDatos: base.DATABASE_URL,
      urlRedis: base.REDIS_URL,
      puertoApi: 3000,
      catalogoCacheTtlSegundos: 240,
      saludTimeoutMs: 2000,
      entorno: 'development',
      envioOtp: 'simulado',
      trustProxySaltos: 1,
    });
  });

  it('toma la versión de apps/api/package.json si no se indica VERSION_SERVICIO', () => {
    expect(cargarConfiguracion(base).versionServicio).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('convierte los valores numéricos y respeta VERSION_SERVICIO', () => {
    const configuracion = cargarConfiguracion({
      ...base,
      PUERTO_API: '4000',
      CATALOGO_CACHE_TTL_SEGUNDOS: '60',
      SALUD_TIMEOUT_MS: '1500',
      VERSION_SERVICIO: '2.1.0',
      TRUST_PROXY_SALTOS: '2',
    });

    expect(configuracion.puertoApi).toBe(4000);
    expect(configuracion.catalogoCacheTtlSegundos).toBe(60);
    expect(configuracion.saludTimeoutMs).toBe(1500);
    expect(configuracion.versionServicio).toBe('2.1.0');
    expect(configuracion.trustProxySaltos).toBe(2);
  });

  describe('CATALOGO_CACHE_TTL_SEGUNDOS (FR-024 de la 003: máximo 5 minutos en total)', () => {
    it('vale 240 por defecto', () => {
      expect(cargarConfiguracion(base).catalogoCacheTtlSegundos).toBe(240);
    });

    it('acepta 240', () => {
      const configuracion = cargarConfiguracion({ ...base, CATALOGO_CACHE_TTL_SEGUNDOS: '240' });
      expect(configuracion.catalogoCacheTtlSegundos).toBe(240);
    });

    it('rechaza 241 nombrando la variable y explicando el límite', () => {
      const mensaje = mensajeDe(() =>
        cargarConfiguracion({ ...base, CATALOGO_CACHE_TTL_SEGUNDOS: '241' }),
      );

      expect(mensaje).toContain('CATALOGO_CACHE_TTL_SEGUNDOS');
      expect(mensaje).toContain('TTL de Redis + 60 s del navegador no puede superar 5 minutos');
    });
  });

  describe('ALMACEN_ARCHIVOS_RUTA (004, research §R-08)', () => {
    it('usa por defecto una carpeta dentro de los temporales del sistema', () => {
      expect(cargarConfiguracion(base).almacenArchivosRuta).toBe(
        join(tmpdir(), 'licencias-archivos'),
      );
    });

    it('acepta una ruta absoluta', () => {
      const ruta = join(tmpdir(), 'otra-carpeta');
      expect(
        cargarConfiguracion({ ...base, ALMACEN_ARCHIVOS_RUTA: ruta }).almacenArchivosRuta,
      ).toBe(ruta);
    });

    it('rechaza una ruta relativa nombrando la variable', () => {
      expect(
        mensajeDe(() => cargarConfiguracion({ ...base, ALMACEN_ARCHIVOS_RUTA: 'archivos' })),
      ).toContain('ALMACEN_ARCHIVOS_RUTA');
    });
  });

  it('acepta TRUST_PROXY_SALTOS=0', () => {
    expect(cargarConfiguracion({ ...base, TRUST_PROXY_SALTOS: '0' }).trustProxySaltos).toBe(0);
  });

  it('decodifica las claves de cifrado y HMAC a bytes', () => {
    const configuracion = cargarConfiguracion(base);

    expect(configuracion.claveCifradoDatos).toHaveLength(32);
    expect(configuracion.claveHmacDatos.length).toBeGreaterThanOrEqual(32);
    expect(configuracion.jwtSecreto).toBe(claves.JWT_SECRETO);
  });

  it('trata una variable vacía como ausente', () => {
    expect(cargarConfiguracion({ ...base, PUERTO_API: '' }).puertoApi).toBe(3000);
  });

  it('rechaza valores inválidos nombrando solo las variables', () => {
    const mensaje = mensajeDe(() =>
      cargarConfiguracion({ DATABASE_URL: `no-es-url-${secreto}`, SALUD_TIMEOUT_MS: '0' }),
    );

    expect(mensaje).toContain('DATABASE_URL');
    expect(mensaje).toContain('REDIS_URL');
    expect(mensaje).toContain('SALUD_TIMEOUT_MS');
    expect(mensaje).toContain('JWT_SECRETO');
    expect(mensaje).not.toContain(secreto);
  });

  it.each([
    ['JWT_SECRETO', 'corto'],
    ['CLAVE_CIFRADO_DATOS', aBase64('solo-16-bytes!!!')],
    ['CLAVE_CIFRADO_DATOS', aBase64('0123456789abcdef0123456789abcdef-sobra')],
    ['CLAVE_CIFRADO_DATOS', 'esto no es base64 %%%'],
    ['CLAVE_HMAC_DATOS', aBase64('hmac-corto')],
    ['NODE_ENV', 'staging'],
    ['ENVIO_OTP', 'correo'],
    ['TRUST_PROXY_SALTOS', '-1'],
  ])('rechaza %s inválido sin mostrar el valor', (variable, valor) => {
    const mensaje = mensajeDe(() => cargarConfiguracion({ ...base, [variable]: valor }));

    expect(mensaje).toContain(variable);
    expect(mensaje).not.toContain(valor);
  });

  it('rechaza ENVIO_OTP=sms mientras no haya proveedor de SMS', () => {
    expect(mensajeDe(() => cargarConfiguracion({ ...base, ENVIO_OTP: 'sms' }))).toContain(
      'No hay proveedor de SMS configurado',
    );
  });

  describe('en producción', () => {
    const produccion = { ...base, NODE_ENV: 'production', ENVIO_OTP: 'sms' };

    it('rechaza el envío simulado del código (FR-031)', () => {
      const mensaje = mensajeDe(() =>
        cargarConfiguracion({ ...produccion, ENVIO_OTP: 'simulado' }),
      );

      expect(mensaje).toContain('ENVIO_OTP');
    });

    it.each([
      ['JWT_SECRETO', 'desarrollo-jwt-solo-no-usar-en-produccion'],
      ['CLAVE_CIFRADO_DATOS', 'ZGVzYXJyb2xsby1jaWZyYWRvLW5vLXVzYXItcHJvZCE='],
      ['CLAVE_HMAC_DATOS', 'ZGVzYXJyb2xsby1obWFjLXNvbG8tbm8tdXNhci1lbi1wcm9kdWNjaW9u'],
    ])('rechaza %s con el valor de ejemplo de .env.example', (variable, valorEjemplo) => {
      const mensaje = mensajeDe(() =>
        cargarConfiguracion({ ...produccion, ENVIO_OTP: 'simulado', [variable]: valorEjemplo }),
      );

      expect(mensaje).toContain(variable);
      expect(mensaje).not.toContain(valorEjemplo);
    });
  });
});
