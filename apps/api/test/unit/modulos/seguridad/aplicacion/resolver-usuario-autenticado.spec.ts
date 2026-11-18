import { ErrorAutenticacion } from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { ResolverUsuarioAutenticado } from '../../../../../src/modulos/seguridad/aplicacion/resolver-usuario-autenticado';
import type {
  AlmacenVersionSeguridad,
  EstadoSeguridadEnCache,
} from '../../../../../src/modulos/seguridad/dominio/puertos/almacen-version-seguridad';
import type { ReclamosAcceso } from '../../../../../src/modulos/seguridad/dominio/puertos/emisor-tokens';
import type { EstadoSeguridadUsuario } from '../../../../../src/modulos/seguridad/dominio/puertos/repositorio-usuarios';
import { RepositorioUsuariosEnMemoria } from './dobles';

const reclamos: ReclamosAcceso = {
  sub: 'usuario-1',
  sid: 'sesion-1',
  roles: ['CAJA'],
  vs: 3,
  dcc: false,
};

class AlmacenControlable implements AlmacenVersionSeguridad {
  estado: EstadoSeguridadEnCache | null = { version: 3, sesionRevocada: false };
  readonly publicadas: [string, number][] = [];
  fallaAlPublicar = false;
  leerEstado(): Promise<EstadoSeguridadEnCache | null> {
    return Promise.resolve(this.estado);
  }
  publicarVersion(usuarioId: string, version: number): Promise<void> {
    if (this.fallaAlPublicar) {
      return Promise.reject(new Error('redis caído'));
    }
    this.publicadas.push([usuarioId, version]);
    return Promise.resolve();
  }
  marcarSesionesRevocadas(): Promise<void> {
    return Promise.resolve();
  }
}

class RepositorioConEstado extends RepositorioUsuariosEnMemoria {
  estado: EstadoSeguridadUsuario | null = {
    activo: true,
    versionSeguridad: 4,
    roles: ['JEFATURA'],
    debeCambiarClave: false,
    sesionRevocada: false,
  };
  consultas = 0;
  override obtenerEstadoSeguridad(): Promise<EstadoSeguridadUsuario | null> {
    this.consultas += 1;
    return Promise.resolve(this.estado);
  }
}

const preparar = () => {
  const almacen = new AlmacenControlable();
  const usuarios = new RepositorioConEstado();
  const casoDeUso = new ResolverUsuarioAutenticado({ almacen, usuarios });
  return { almacen, usuarios, casoDeUso };
};

describe('ResolverUsuarioAutenticado (research.md §R-07)', () => {
  it('con la versión de la caché igual a la del token usa los roles del token sin consultar la base', async () => {
    const { usuarios, casoDeUso } = preparar();

    await expect(casoDeUso.ejecutar(reclamos)).resolves.toEqual({
      usuarioId: 'usuario-1',
      sesionId: 'sesion-1',
      roles: ['CAJA'],
      versionSeguridad: 3,
      debeCambiarClave: false,
    });
    expect(usuarios.consultas).toBe(0);
  });

  it('con una versión distinta usa los roles y la clave temporal actuales', async () => {
    const { almacen, usuarios, casoDeUso } = preparar();
    almacen.estado = { version: 4, sesionRevocada: false };
    if (usuarios.estado) {
      usuarios.estado = { ...usuarios.estado, debeCambiarClave: true };
    }

    await expect(casoDeUso.ejecutar(reclamos)).resolves.toMatchObject({
      roles: ['JEFATURA'],
      versionSeguridad: 4,
      debeCambiarClave: true,
    });
    expect(usuarios.consultas).toBe(1);
  });

  it('con una versión distinta y el usuario inactivo no autentica (FR-011)', async () => {
    const { almacen, usuarios, casoDeUso } = preparar();
    almacen.estado = { version: 4, sesionRevocada: false };
    if (usuarios.estado) {
      usuarios.estado = { ...usuarios.estado, activo: false };
    }

    await expect(casoDeUso.ejecutar(reclamos)).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('si el usuario ya no existe no autentica', async () => {
    const { almacen, usuarios, casoDeUso } = preparar();
    almacen.estado = { version: 4, sesionRevocada: false };
    usuarios.estado = null;

    await expect(casoDeUso.ejecutar(reclamos)).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('una sesión marcada como revocada en la caché no autentica aunque la versión coincida (FR-004)', async () => {
    const { almacen, usuarios, casoDeUso } = preparar();
    almacen.estado = { version: 3, sesionRevocada: true };

    await expect(casoDeUso.ejecutar(reclamos)).rejects.toBeInstanceOf(ErrorAutenticacion);
    expect(usuarios.consultas).toBe(0);
  });

  it('si la caché no responde lee la base y vuelve a publicar la versión', async () => {
    const { almacen, usuarios, casoDeUso } = preparar();
    almacen.estado = null;

    await expect(casoDeUso.ejecutar(reclamos)).resolves.toMatchObject({ roles: ['JEFATURA'] });
    expect(usuarios.consultas).toBe(1);
    expect(almacen.publicadas).toEqual([['usuario-1', 4]]);
  });

  it('si la caché no tiene la clave lee la base y la publica', async () => {
    const { almacen, casoDeUso } = preparar();
    almacen.estado = { version: null, sesionRevocada: false };

    await casoDeUso.ejecutar(reclamos);

    expect(almacen.publicadas).toEqual([['usuario-1', 4]]);
  });

  it('si no puede publicar la versión igual responde con los datos de la base', async () => {
    const { almacen, casoDeUso } = preparar();
    almacen.estado = null;
    almacen.fallaAlPublicar = true;

    await expect(casoDeUso.ejecutar(reclamos)).resolves.toMatchObject({ roles: ['JEFATURA'] });
  });

  it('con la caché caída y la sesión revocada en la base no autentica', async () => {
    const { almacen, usuarios, casoDeUso } = preparar();
    almacen.estado = null;
    if (usuarios.estado) {
      usuarios.estado = { ...usuarios.estado, versionSeguridad: 3, sesionRevocada: true };
    }

    await expect(casoDeUso.ejecutar(reclamos)).rejects.toBeInstanceOf(ErrorAutenticacion);
  });
});
