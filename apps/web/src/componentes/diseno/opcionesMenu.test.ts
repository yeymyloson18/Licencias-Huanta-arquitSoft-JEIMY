import type { Rol } from '../../servicios/clienteApi';
import { opcionesDe } from './opcionesMenu';

// 013 (FR-005, SC-007): el menú lateral se arma con EXACTAMENTE las mismas opciones por rol que el
// menú de hoy (Menu.tsx antes de la 013): mismas etiquetas, rutas, orden y reglas.

const ADMINISTRADOR = [
  ['Panel', '/admin'],
  ['Usuarios', '/admin/usuarios'],
  ['Catálogo', '/admin/catalogo'],
  ['Feriados', '/admin/feriados'],
  ['Auditoría', '/admin/auditoria'],
];

const ESPERADO: Readonly<Record<Rol, string[][]>> = {
  ADMINISTRADOR,
  MESA_PARTES: [
    ['Expedientes', '/personal/expedientes'],
    ['Registrar solicitud', '/personal/mesa-partes/nueva'],
  ],
  EVALUADOR: [['Expedientes', '/personal/expedientes']],
  CAJA: [['Caja', '/personal/caja']],
  INSPECTOR: [['Inspecciones', '/personal/inspecciones']],
  JEFATURA: [
    ['Expedientes', '/personal/expedientes'],
    ['Auditoría', '/personal/auditoria'],
    ['Inspecciones', '/personal/inspecciones'],
    ['Alertas', '/personal/alertas'],
    ['Tablero', '/personal/tablero'],
  ],
};

const pares = (roles: readonly Rol[]) =>
  opcionesDe(roles).map((opcion) => [opcion.etiqueta, opcion.ruta]);

describe('opcionesDe (menú lateral por rol)', () => {
  it.each(Object.entries(ESPERADO))('%s ve exactamente sus opciones de hoy', (rol, esperado) => {
    expect(pares([rol as Rol])).toEqual(esperado);
  });

  it('sin roles no hay opciones de trabajo', () => {
    expect(pares([])).toEqual([]);
  });

  it('con varios roles respeta el orden del menú y no repite opciones', () => {
    expect(pares(['INSPECTOR', 'CAJA'])).toEqual([
      ['Caja', '/personal/caja'],
      ['Inspecciones', '/personal/inspecciones'],
    ]);
    expect(pares(['JEFATURA', 'EVALUADOR', 'INSPECTOR'])).toEqual(ESPERADO.JEFATURA);
  });
});
