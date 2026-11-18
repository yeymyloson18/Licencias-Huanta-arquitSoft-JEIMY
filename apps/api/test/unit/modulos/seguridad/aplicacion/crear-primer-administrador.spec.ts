import { CrearPrimerAdministrador } from '../../../../../src/modulos/seguridad/aplicacion/crear-primer-administrador';
import {
  ErrorClaveInvalida,
  ErrorDatosInvalidos,
} from '../../../../../src/modulos/seguridad/aplicacion/errores';
import type { Usuario } from '../../../../../src/modulos/seguridad/dominio/usuario';
import {
  GeneradorFalso,
  HasherFalso,
  RelojFalso,
  RepositorioUsuariosEnMemoria,
  usuarioFicticio,
} from './dobles';

/** Repositorio en memoria con las operaciones del primer administrador. */
class RepositorioConAdministradores extends RepositorioUsuariosEnMemoria {
  override hayAdministradorActivo(): Promise<boolean> {
    return Promise.resolve(
      [...this.usuarios.values()].some((u) => u.activo && u.tieneRol('ADMINISTRADOR')),
    );
  }
  override async crearSiNoHayAdministradores(usuario: Usuario): Promise<boolean> {
    if (await this.hayAdministradorActivo()) {
      return false;
    }
    await this.crear(usuario);
    return true;
  }
}

const DATOS = {
  correo: 'Admin@Ejemplo.pe',
  nombre: 'Administración Municipal',
  celular: '987654321',
  clave: 'ClaveInicial2026',
};

const preparar = () => {
  const usuarios = new RepositorioConAdministradores();
  const casoDeUso = new CrearPrimerAdministrador({
    usuarios,
    hasher: new HasherFalso(),
    generador: new GeneradorFalso(),
    reloj: new RelojFalso(),
  });
  return { usuarios, casoDeUso };
};

describe('CrearPrimerAdministrador (historia 3)', () => {
  it('sin administradores activos crea uno activo, con clave temporal y asignado por sí mismo', async () => {
    const { usuarios, casoDeUso } = preparar();

    const resultado = await casoDeUso.ejecutar(DATOS);

    expect(resultado).toEqual({ resultado: 'CREADO', usuarioId: 'id-1' });
    const creado = await usuarios.obtenerPorId('id-1');
    expect(creado?.activo).toBe(true);
    expect(creado?.rolesVigentes).toEqual(['ADMINISTRADOR']);
    expect(creado?.debeCambiarClave).toBe(true);
    expect(creado?.asignaciones[0]?.asignadoPor).toBe('id-1');
    expect(creado?.correo.valor).toBe('admin@ejemplo.pe');
    expect(creado?.claveHash).toBe('h:ClaveInicial2026');
  });

  it('con un administrador activo no crea ni modifica nada (FR-024)', async () => {
    const { usuarios, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio({ id: 'admin-existente', roles: ['ADMINISTRADOR'] }));

    await expect(casoDeUso.ejecutar(DATOS)).resolves.toEqual({ resultado: 'YA_EXISTE' });
    expect(usuarios.usuarios.size).toBe(1);
    expect(usuarios.guardados).toBe(0);
  });

  it('un administrador inactivo no cuenta: se crea uno nuevo', async () => {
    const { usuarios, casoDeUso } = preparar();
    await usuarios.crear(
      usuarioFicticio({ id: 'admin-inactivo', roles: ['ADMINISTRADOR'], activo: false }),
    );

    await expect(casoDeUso.ejecutar(DATOS)).resolves.toMatchObject({ resultado: 'CREADO' });
  });

  it('con el correo de otro usuario (no administrador) devuelve CORREO_EN_USO', async () => {
    const { usuarios, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio({ correo: 'admin@ejemplo.pe', roles: ['CAJA'] }));

    await expect(casoDeUso.ejecutar(DATOS)).resolves.toEqual({ resultado: 'CORREO_EN_USO' });
    expect(usuarios.usuarios.size).toBe(1);
  });

  it('rechaza una clave que no cumple la política, con las reglas incumplidas (FR-022a)', async () => {
    const { usuarios, casoDeUso } = preparar();

    const error = await casoDeUso.ejecutar({ ...DATOS, clave: 'corta' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorClaveInvalida);
    expect((error as ErrorClaveInvalida).reglas).toEqual(['LONGITUD_MINIMA', 'SIN_NUMERO']);
    expect(usuarios.usuarios.size).toBe(0);
  });

  it('rechaza datos inválidos indicando solo los campos, sin sus valores', async () => {
    const { casoDeUso } = preparar();

    const error = await casoDeUso
      .ejecutar({
        correo: 'no-es-correo',
        nombre: 'A',
        celular: '12345',
        clave: 'ClaveInicial2026',
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorDatosInvalidos);
    expect((error as ErrorDatosInvalidos).campos).toEqual(['correo', 'nombre', 'celular']);
    expect((error as Error).message).not.toContain('no-es-correo');
  });

  it('si otro proceso creó un administrador entre la comprobación y la creación, devuelve YA_EXISTE', async () => {
    const { usuarios, casoDeUso } = preparar();
    jest.spyOn(usuarios, 'hayAdministradorActivo').mockResolvedValueOnce(false);
    await usuarios.crear(usuarioFicticio({ id: 'otro-admin', roles: ['ADMINISTRADOR'] }));

    await expect(casoDeUso.ejecutar(DATOS)).resolves.toEqual({ resultado: 'YA_EXISTE' });
  });
});
