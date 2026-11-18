import { esRol, ROLES } from '../../../../../src/modulos/seguridad/dominio/rol';

describe('Rol', () => {
  it('tiene exactamente los 6 roles del personal', () => {
    expect(ROLES).toEqual([
      'MESA_PARTES',
      'EVALUADOR',
      'INSPECTOR',
      'CAJA',
      'JEFATURA',
      'ADMINISTRADOR',
    ]);
  });

  it.each(ROLES)('reconoce %s', (rol) => {
    expect(esRol(rol)).toBe(true);
  });

  it.each(['administrador', 'CAJERO', '', 42, null])('rechaza %p', (valor) => {
    expect(esRol(valor)).toBe(false);
  });
});
