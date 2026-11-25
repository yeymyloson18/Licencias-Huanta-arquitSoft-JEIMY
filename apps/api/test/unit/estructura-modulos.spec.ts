import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// SC-009: los 10 módulos de negocio existen y cada uno tiene sus 4 capas (constitución, principio I;
// el décimo, orientacion, desde la enmienda 1.1.0 de la 012).
const RAIZ_MODULOS = join(__dirname, '..', '..', 'src', 'modulos');

const MODULOS = [
  'seguridad',
  'catalogo',
  'tramites',
  'pagos',
  'inspecciones',
  'licencias',
  'plazos',
  'notificaciones',
  'reportes',
  'orientacion',
];

const CAPAS = ['dominio', 'aplicacion', 'infraestructura', 'presentacion'];

const carpetasDe = (ruta: string): string[] =>
  readdirSync(ruta).filter((nombre) => statSync(join(ruta, nombre)).isDirectory());

describe('estructura de módulos', () => {
  it('src/modulos contiene exactamente los 10 módulos de negocio', () => {
    expect(carpetasDe(RAIZ_MODULOS).sort()).toEqual([...MODULOS].sort());
  });

  it.each(MODULOS)(
    'el módulo %s tiene las capas dominio, aplicacion, infraestructura y presentacion',
    (modulo) => {
      for (const capa of CAPAS) {
        expect(existsSync(join(RAIZ_MODULOS, modulo, capa))).toBe(true);
      }
    },
  );
});
