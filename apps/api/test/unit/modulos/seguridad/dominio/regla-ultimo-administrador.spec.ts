import {
  ErrorUltimoAdministrador,
  ReglaUltimoAdministrador,
} from '../../../../../src/modulos/seguridad/dominio/regla-ultimo-administrador';
import { usuarioFicticio } from '../aplicacion/dobles';

const T1 = new Date('2026-11-18T10:00:00Z');

describe('ReglaUltimoAdministrador (FR-020)', () => {
  it('rechaza desactivar al único administrador activo', () => {
    const admin = usuarioFicticio({ id: 'a-1', roles: ['ADMINISTRADOR'] });
    admin.desactivar();

    expect(() => ReglaUltimoAdministrador.verificar(['a-1'], admin)).toThrow(
      ErrorUltimoAdministrador,
    );
  });

  it('rechaza quitarle ADMINISTRADOR al único administrador activo, también si es él mismo', () => {
    const admin = usuarioFicticio({ id: 'a-1', roles: ['ADMINISTRADOR', 'JEFATURA'] });
    admin.reemplazarRoles(['JEFATURA'], 'a-1', T1);

    expect(() => ReglaUltimoAdministrador.verificar(['a-1'], admin)).toThrow(
      ErrorUltimoAdministrador,
    );
  });

  it('permite si queda al menos otro administrador activo', () => {
    const admin = usuarioFicticio({ id: 'a-1', roles: ['ADMINISTRADOR'] });
    admin.desactivar();

    expect(() => ReglaUltimoAdministrador.verificar(['a-1', 'a-2'], admin)).not.toThrow();
  });

  it('permite cambiar al único administrador si sigue siéndolo', () => {
    const admin = usuarioFicticio({ id: 'a-1', roles: ['ADMINISTRADOR'] });
    admin.reemplazarRoles(['ADMINISTRADOR', 'JEFATURA'], 'a-1', T1);

    expect(() => ReglaUltimoAdministrador.verificar(['a-1'], admin)).not.toThrow();
  });

  it('no afecta a operaciones sobre usuarios que no son administradores', () => {
    const caja = usuarioFicticio({ id: 'c-1', roles: ['CAJA'] });
    caja.desactivar();

    expect(() => ReglaUltimoAdministrador.verificar(['a-1'], caja)).not.toThrow();
    expect(() => ReglaUltimoAdministrador.verificar([], caja)).not.toThrow();
  });

  it('el error no incluye datos del usuario', () => {
    expect(new ErrorUltimoAdministrador().message).toBe(
      'Debe existir al menos un administrador activo',
    );
  });
});
