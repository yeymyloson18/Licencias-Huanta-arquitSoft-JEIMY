import { CrearUsuario } from '../../../../../src/modulos/seguridad/aplicacion/crear-usuario';
import {
  ErrorClaveInvalida,
  ErrorCorreoEnUso,
  ErrorDatosInvalidos,
} from '../../../../../src/modulos/seguridad/aplicacion/errores';
import {
  GeneradorFalso,
  HasherFalso,
  RelojFalso,
  RepositorioUsuariosEnMemoria,
  T0,
  usuarioFicticio,
} from './dobles';

const DATOS = {
  correo: 'Nueva.Persona@Ejemplo.pe',
  nombreCompleto: 'Nueva Persona',
  celular: '912345678',
  claveTemporal: 'ClaveTemporal2026',
  roles: ['EVALUADOR', 'INSPECTOR'] as const,
};

const preparar = () => {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const casoDeUso = new CrearUsuario({
    usuarios,
    hasher: new HasherFalso(),
    generador: new GeneradorFalso(),
    reloj: new RelojFalso(),
  });
  return { usuarios, casoDeUso };
};

describe('CrearUsuario (FR-017, FR-019, FR-022)', () => {
  it('crea un usuario activo con clave temporal y registra quién asignó cada rol', async () => {
    const { usuarios, casoDeUso } = preparar();

    const usuario = await casoDeUso.ejecutar({ ...DATOS, roles: [...DATOS.roles] }, 'admin-1');

    expect(usuario.correo.valor).toBe('nueva.persona@ejemplo.pe');
    expect(usuario.activo).toBe(true);
    expect(usuario.debeCambiarClave).toBe(true);
    expect(usuario.claveHash).toBe('h:ClaveTemporal2026');
    expect(usuario.rolesVigentes).toEqual(['EVALUADOR', 'INSPECTOR']);
    expect(usuario.asignaciones.map((a) => [a.asignadoPor, a.asignadoEn])).toEqual([
      ['admin-1', T0],
      ['admin-1', T0],
    ]);
    expect(await usuarios.obtenerPorId(usuario.id)).toBe(usuario);
  });

  it('rechaza un correo ya usado por otro usuario', async () => {
    const { usuarios, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio({ correo: 'nueva.persona@ejemplo.pe' }));

    await expect(
      casoDeUso.ejecutar({ ...DATOS, roles: [...DATOS.roles] }, 'admin-1'),
    ).rejects.toBeInstanceOf(ErrorCorreoEnUso);
  });

  it('rechaza una clave temporal que no cumple la política', async () => {
    const { casoDeUso } = preparar();

    const error = await casoDeUso
      .ejecutar({ ...DATOS, roles: [...DATOS.roles], claveTemporal: 'corta' }, 'admin-1')
      .catch((e: unknown) => e);

    expect((error as ErrorClaveInvalida).reglas).toEqual(['LONGITUD_MINIMA', 'SIN_NUMERO']);
  });

  it('exige al menos un rol y datos válidos, indicando solo los campos', async () => {
    const { casoDeUso } = preparar();

    const error = await casoDeUso
      .ejecutar({ ...DATOS, celular: '123', nombreCompleto: 'X', roles: [] }, 'admin-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorDatosInvalidos);
    expect((error as ErrorDatosInvalidos).campos).toEqual(['nombreCompleto', 'celular', 'roles']);
  });
});
