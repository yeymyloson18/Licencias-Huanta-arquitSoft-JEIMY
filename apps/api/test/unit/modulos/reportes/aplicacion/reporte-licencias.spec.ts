import {
  LIMITE_FILAS,
  ReporteLicencias,
} from '../../../../../src/modulos/reportes/aplicacion/reporte-licencias';
import type { FilaReporte } from '../../../../../src/modulos/reportes/dominio/puertos';

// Datos FICTICIOS.
const fila = (numero: string, giro = 'Bodega', zona = 'Centro'): FilaReporte => ({
  numero,
  codigoReceta: 'LIC-02',
  titular: 'Juana P. Q.',
  giro,
  zona,
  estado: 'VIGENTE',
  fecha: '2026-11-20',
});

describe('ReporteLicencias (007)', () => {
  let guardados: Map<string, string>;
  let pedidos: string[];

  const crear = (vigentes: FilaReporte[] = []) =>
    new ReporteLicencias({
      tramites: {
        expedientesEnTramite: (codigo) => {
          pedidos.push(`EN_TRAMITE:${codigo ?? '*'}`);
          return Promise.resolve([fila('EXP-2026-000001')]);
        },
      },
      licencias: {
        vigentes: (codigo) => {
          pedidos.push(`VIGENTES:${codigo ?? '*'}`);
          return Promise.resolve(vigentes);
        },
        itsePorVencer: () => {
          pedidos.push('ITSE');
          return Promise.resolve([fila('LF-2026-000009')]);
        },
      },
      cache: {
        leer: (clave) => Promise.resolve(guardados.get(clave) ?? null),
        guardar: (clave, valor) => {
          guardados.set(clave, valor);
          return Promise.resolve();
        },
      },
      avisar: () => undefined,
    });

  beforeEach(() => {
    guardados = new Map();
    pedidos = [];
  });

  it('cada situación pide a su fuente con el código de licencia', async () => {
    await crear().ejecutar({ situacion: 'VIGENTES', codigoReceta: 'LIC-02' });
    await crear().ejecutar({ situacion: 'EN_TRAMITE' });
    const itse = await crear().ejecutar({ situacion: 'ITSE_POR_VENCER' });

    expect(pedidos).toEqual(['VIGENTES:LIC-02', 'EN_TRAMITE:*', 'ITSE']);
    expect(itse).toEqual({ filas: [fila('LF-2026-000009')], truncado: false });
  });

  it('filtra giro y zona sin mayúsculas ni tildes', async () => {
    const resultado = await crear([
      fila('LF-1', 'Bodega', 'Centro'),
      fila('LF-2', 'Farmacia', 'Centro'),
      fila('LF-3', 'BODEGA', 'Pampa Ñahuín'),
    ]).ejecutar({ situacion: 'VIGENTES', giro: 'bódega', zona: 'pampa nahuin' });

    expect(resultado.filas.map((f) => f.numero)).toEqual(['LF-3']);
  });

  it('limita a 5,000 filas y avisa que hay más', async () => {
    const muchas = Array.from({ length: LIMITE_FILAS + 1 }, (_, i) => fila(`LF-${String(i)}`));

    const resultado = await crear(muchas).ejecutar({ situacion: 'VIGENTES' });

    expect(resultado.filas).toHaveLength(LIMITE_FILAS);
    expect(resultado.truncado).toBe(true);
  });

  it('la misma consulta se responde desde la caché; con otros filtros no', async () => {
    await crear([fila('LF-1')]).ejecutar({ situacion: 'VIGENTES', giro: 'Bodega' });
    await crear([fila('LF-1')]).ejecutar({ situacion: 'VIGENTES', giro: 'bodega ' });
    await crear([fila('LF-1')]).ejecutar({ situacion: 'VIGENTES', zona: 'Centro' });

    expect(pedidos).toEqual(['VIGENTES:*', 'VIGENTES:*']);
    expect(
      [...guardados.keys()].every((clave) =>
        /^rep:licencias:VIGENTES:\*:[0-9a-f]{16}$/.test(clave),
      ),
    ).toBe(true);
  });
});
