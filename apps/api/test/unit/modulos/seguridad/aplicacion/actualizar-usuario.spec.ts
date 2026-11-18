import { ActualizarUsuario } from '../../../../../src/modulos/seguridad/aplicacion/actualizar-usuario';
import {
  ErrorDatosInvalidos,
  ErrorUsuarioNoEncontrado,
} from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { ErrorUltimoAdministrador } from '../../../../../src/modulos/seguridad/dominio/regla-ultimo-administrador';
import { Sesion } from '../../../../../src/modulos/seguridad/dominio/sesion';
import {
  AlmacenFalso,
  EventosFalsos,
  RelojFalso,
  RepositorioSesionesEnMemoria,
  RepositorioUsuariosEnMemoria,
  T0,
  usuarioFicticio,
} from './dobles';

const preparar = async () => {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const sesiones = new RepositorioSesionesEnMemoria();
  const almacen = new AlmacenFalso();
  const eventos = new EventosFalsos();
  await usuarios.crear(
    usuarioFicticio({ id: 'admin-1', correo: 'a1@ejemplo.pe', roles: ['ADMINISTRADOR'] }),
  );
  await usuarios.crear(usuarioFicticio({ id: 'caja-1', correo: 'c1@ejemplo.pe', roles: ['CAJA'] }));
  await sesiones.crear(
    Sesion.crear({ id: 's-1', usuarioId: 'caja-1', refreshHash: 'h', creadaEn: T0 }),
  );
  await sesiones.crear(
    Sesion.crear({ id: 's-2', usuarioId: 'caja-1', refreshHash: 'h', creadaEn: T0 }),
  );
  const casoDeUso = new ActualizarUsuario({
    usuarios,
    sesiones,
    almacen,
    reloj: new RelojFalso(),
    eventos,
  });
  return { usuarios, sesiones, almacen, eventos, casoDeUso };
};

describe('ActualizarUsuario (FR-018, FR-011, FR-020)', () => {
  it('cambia el nombre y el celular (el correo no se puede cambiar)', async () => {
    const { casoDeUso } = await preparar();

    const usuario = await casoDeUso.ejecutar('caja-1', {
      nombreCompleto: '  Nombre Corregido ',
      celular: '912345678',
    });

    expect(usuario.nombreCompleto.valor).toBe('Nombre Corregido');
    expect(usuario.celular.valor).toBe('912345678');
    expect(usuario.correo.valor).toBe('c1@ejemplo.pe');
  });

  it('desactivar sube la versión, revoca todas las sesiones y registra el evento', async () => {
    const { usuarios, sesiones, almacen, eventos, casoDeUso } = await preparar();
    const versionAntes = (await usuarios.obtenerPorId('caja-1'))?.versionSeguridad ?? 0;

    const usuario = await casoDeUso.ejecutar('caja-1', { activo: false });

    expect(usuario.activo).toBe(false);
    expect(usuario.versionSeguridad).toBe(versionAntes + 1);
    expect((await sesiones.obtenerPorId('s-1'))?.revocada).toBe(true);
    expect(almacen.revocadas.sort()).toEqual(['s-1', 's-2']);
    expect(almacen.versiones.get('caja-1')).toBe(versionAntes + 1);
    expect(eventos.registrados).toContainEqual({
      evento: 'usuario-desactivado',
      ids: { usuarioId: 'caja-1' },
    });
  });

  it('reactivar no revoca sesiones ni registra desactivación', async () => {
    const { almacen, eventos, casoDeUso } = await preparar();
    await casoDeUso.ejecutar('caja-1', { activo: false });
    almacen.revocadas.length = 0;

    const usuario = await casoDeUso.ejecutar('caja-1', { activo: true });

    expect(usuario.activo).toBe(true);
    expect(almacen.revocadas).toEqual([]);
    expect(eventos.nombres().filter((e) => e === 'usuario-desactivado')).toHaveLength(1);
  });

  it('no permite desactivar al último administrador activo y no guarda nada', async () => {
    const { usuarios, casoDeUso } = await preparar();

    await expect(casoDeUso.ejecutar('admin-1', { activo: false })).rejects.toBeInstanceOf(
      ErrorUltimoAdministrador,
    );
    expect((await usuarios.obtenerPorId('admin-1'))?.activo).toBe(true);
  });

  it('valida los datos y responde no encontrado si el usuario no existe', async () => {
    const { casoDeUso } = await preparar();

    const error = await casoDeUso.ejecutar('caja-1', { celular: '123' }).catch((e: unknown) => e);
    expect((error as ErrorDatosInvalidos).campos).toEqual(['celular']);
    await expect(casoDeUso.ejecutar('no-existe', { activo: false })).rejects.toBeInstanceOf(
      ErrorUsuarioNoEncontrado,
    );
  });
});
