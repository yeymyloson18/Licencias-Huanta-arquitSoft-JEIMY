import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Prueba de la configuración `.dependency-cruiser.cjs` (research.md §R-12): los archivos de
// `fixtures/` violan cada regla exactamente una vez y el import a la fachada está permitido.
// `cruzar-fixtures.mjs` ejecuta `cruise()` en un proceso aparte porque dependency-cruiser es ESM.

interface Violacion {
  regla: string;
  desde: string;
  hacia: string;
}

const MODULOS_FIXTURES = 'apps/api/test/regla-dependencia/fixtures/src/modulos/';

const cruzarFixtures = (): Violacion[] => {
  const salida = execFileSync(process.execPath, [join(__dirname, 'cruzar-fixtures.mjs')], {
    encoding: 'utf8',
  });
  return JSON.parse(salida) as Violacion[];
};

const relativa = (ruta: string): string => ruta.replace(MODULOS_FIXTURES, '');

describe('regla de dependencia (dependency-cruiser)', () => {
  let violaciones: Violacion[];

  beforeAll(() => {
    violaciones = cruzarFixtures();
  }, 60000);

  it.each([
    ['dominio-sin-externos', 'catalogo/dominio/viola-externos.ts'],
    ['dominio-sin-otras-capas', 'catalogo/dominio/viola-otras-capas.ts'],
    ['aplicacion-hacia-dentro', 'catalogo/aplicacion/viola-hacia-dentro.ts'],
    ['aislamiento-entre-modulos', 'tramites/aplicacion/viola-aislamiento.ts'],
    ['sin-ciclos', 'catalogo/aplicacion/ciclo-a.ts'],
  ])('detecta exactamente una violación de "%s" en %s', (regla, archivo) => {
    const deLaRegla = violaciones.filter((violacion) => violacion.regla === regla);
    expect(deLaRegla).toHaveLength(1);
    expect(relativa(deLaRegla[0]?.desde ?? '')).toBe(archivo);
  });

  it('no reporta otras violaciones', () => {
    expect(violaciones).toHaveLength(5);
  });

  it('permite que un módulo importe la fachada de otro', () => {
    const desdeLaFachada = violaciones.filter(
      (violacion) =>
        relativa(violacion.desde) === 'tramites/aplicacion/usa-fachada.ts' ||
        relativa(violacion.hacia) === 'catalogo/fachada.ts',
    );
    expect(desdeLaFachada).toEqual([]);
  });
});
