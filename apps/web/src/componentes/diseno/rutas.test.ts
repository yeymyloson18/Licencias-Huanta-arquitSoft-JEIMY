import { esRutaPersonal } from './rutas';

// 013 (FR-004, FR-010): las pantallas del personal usan el área de administración; las demás, el
// portal ligero (también /ingresar y /cambiar-clave).

describe('esRutaPersonal', () => {
  it.each(['/admin', '/admin/usuarios', '/admin/usuarios/x', '/personal/caja', '/perfil'])(
    '%s es del personal',
    (ruta) => {
      expect(esRutaPersonal(ruta)).toBe(true);
    },
  );

  it.each([
    '/',
    '/ingresar',
    '/cambiar-clave',
    '/consulta',
    '/asistente',
    '/tramite/identidad',
    '/administracion',
    '/personales',
  ])('%s es pública', (ruta) => {
    expect(esRutaPersonal(ruta)).toBe(false);
  });
});
