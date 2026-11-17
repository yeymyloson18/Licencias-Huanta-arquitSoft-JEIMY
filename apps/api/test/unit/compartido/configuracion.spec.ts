import {
  cargarConfiguracion,
  ErrorConfiguracion,
} from '../../../src/compartido/infraestructura/configuracion';

const secreto = 'clave_muy_secreta';
const base = {
  DATABASE_URL: `postgresql://licencias:${secreto}@localhost:5432/licencias`,
  REDIS_URL: 'redis://localhost:6379',
};

describe('cargarConfiguracion', () => {
  it('aplica los valores por defecto', () => {
    const configuracion = cargarConfiguracion(base);

    expect(configuracion).toMatchObject({
      urlBaseDeDatos: base.DATABASE_URL,
      urlRedis: base.REDIS_URL,
      puertoApi: 3000,
      catalogoCacheTtlSegundos: 300,
      saludTimeoutMs: 2000,
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
    });

    expect(configuracion.puertoApi).toBe(4000);
    expect(configuracion.catalogoCacheTtlSegundos).toBe(60);
    expect(configuracion.saludTimeoutMs).toBe(1500);
    expect(configuracion.versionServicio).toBe('2.1.0');
  });

  it('trata una variable vacía como ausente', () => {
    expect(cargarConfiguracion({ ...base, PUERTO_API: '' }).puertoApi).toBe(3000);
  });

  it('rechaza valores inválidos nombrando solo las variables', () => {
    const intentar = () =>
      cargarConfiguracion({ DATABASE_URL: `no-es-url-${secreto}`, SALUD_TIMEOUT_MS: '0' });

    expect(intentar).toThrow(ErrorConfiguracion);
    try {
      intentar();
    } catch (error) {
      const mensaje = (error as Error).message;
      expect(mensaje).toContain('DATABASE_URL');
      expect(mensaje).toContain('REDIS_URL');
      expect(mensaje).toContain('SALUD_TIMEOUT_MS');
      expect(mensaje).not.toContain(secreto);
    }
  });
});
