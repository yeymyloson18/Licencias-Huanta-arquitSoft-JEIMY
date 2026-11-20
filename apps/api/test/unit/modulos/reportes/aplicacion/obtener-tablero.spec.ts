import { ObtenerTablero } from '../../../../../src/modulos/reportes/aplicacion/obtener-tablero';
import type { CacheReportes } from '../../../../../src/modulos/reportes/dominio/puertos';
import { ErrorRangoInvalido } from '../../../../../src/modulos/reportes/dominio/rango-fechas';

// Datos FICTICIOS.
const reloj = { ahora: () => new Date('2026-11-20T15:00:00.000Z') };

class CacheEnMemoria implements CacheReportes {
  readonly guardados = new Map<string, { valor: string; segundos: number }>();
  falla = false;
  leer(clave: string) {
    return this.falla
      ? Promise.reject(new Error('sin conexión'))
      : Promise.resolve(this.guardados.get(clave)?.valor ?? null);
  }
  guardar(clave: string, valor: string, segundos: number) {
    if (this.falla) {
      return Promise.reject(new Error('sin conexión'));
    }
    this.guardados.set(clave, { valor, segundos });
    return Promise.resolve();
  }
}

describe('ObtenerTablero (007)', () => {
  let cache: CacheEnMemoria;
  let avisos: string[];
  let consultas: number;
  let pedidosFeriados: [string, string][];

  const crear = () =>
    new ObtenerTablero({
      tramites: {
        conteoPorEstado: () => {
          consultas += 1;
          return Promise.resolve({ PAGADO: 1 });
        },
        atencionesTerminadas: () =>
          Promise.resolve([
            {
              codigoReceta: 'LIC-02',
              presentadoEn: '2026-10-28',
              terminadoEn: '2026-11-03',
              suspensiones: [],
            },
            {
              codigoReceta: 'LIC-03',
              presentadoEn: '2026-11-05',
              terminadoEn: '2026-11-06',
              suspensiones: [],
            },
          ]),
        expedientesEnTramite: () => Promise.resolve([]),
      },
      pagos: {
        pagosRegistrados: () => Promise.resolve([{ codigoReceta: 'LIC-02', monto: '177.10' }]),
      },
      catalogo: {
        plazosPorReceta: () => Promise.resolve([{ codigoReceta: 'LIC-02', plazoDias: 2 }]),
      },
      feriados: {
        feriadosEntre: (desde, hasta) => {
          pedidosFeriados.push([desde, hasta]);
          return Promise.resolve(new Set(['2026-11-02']));
        },
      },
      cache,
      reloj,
      avisar: (mensaje) => avisos.push(mensaje),
    });

  beforeEach(() => {
    cache = new CacheEnMemoria();
    avisos = [];
    consultas = 0;
    pedidosFeriados = [];
  });

  it('calcula con un solo calendario desde la presentación más antigua y guarda 300 s', async () => {
    const tablero = await crear().ejecutar({});

    expect(tablero).toMatchObject({
      desde: '2026-11-01',
      hasta: '2026-11-20',
      expedientesPorEstado: { PAGADO: 1 },
      ingresos: { total: '177.10' },
    });
    // Del 28/10 al 03/11: 29, 30 y 3 (el 31 y el 1 son fin de semana; el 2 es feriado) = 3 días.
    expect(tablero.tiempoPromedioPorReceta[0]).toMatchObject({
      promedioDiasHabiles: 3,
      dentroDelPlazo: 0,
    });
    expect(pedidosFeriados).toEqual([['2026-10-28', '2026-11-20']]);
    expect(cache.guardados.get('rep:tablero:2026-11-01:2026-11-20')?.segundos).toBe(300);
  });

  it('la segunda vez responde desde la caché', async () => {
    await crear().ejecutar({ desde: '2026-11-01', hasta: '2026-11-20' });
    await crear().ejecutar({ desde: '2026-11-01', hasta: '2026-11-20' });

    expect(consultas).toBe(1);
  });

  it('con la caché caída calcula igual y avisa sin parámetros', async () => {
    cache.falla = true;

    const tablero = await crear().ejecutar({});

    expect(tablero.ingresos.total).toBe('177.10');
    expect(avisos).toHaveLength(2);
    expect(avisos.join(' ')).not.toContain('2026');
  });

  it('un rango inválido falla antes de consultar', async () => {
    await expect(crear().ejecutar({ desde: '2026-11-01' })).rejects.toBeInstanceOf(
      ErrorRangoInvalido,
    );
    expect(consultas).toBe(0);
  });
});
