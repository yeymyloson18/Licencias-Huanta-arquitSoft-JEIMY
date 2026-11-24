import { ErrorUsuarioNoEncontrado } from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { ReemplazarRoles } from '../../../../../src/modulos/seguridad/aplicacion/reemplazar-roles';
import { ErrorUltimoAdministrador } from '../../../../../src/modulos/seguridad/dominio/regla-ultimo-administrador';
import {
  AlmacenFalso,
  EventosFalsos,
  RelojFalso,
  RepositorioUsuariosEnMemoria,
  T0,
  usuarioFicticio,
} from './dobles';

const preparar = async () => {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const almacen = new AlmacenFalso();
  const eventos = new EventosFalsos();
  await usuarios.crear(
    usuarioFicticio({ id: 'admin-1', correo: 'a1@ejemplo.pe', roles: ['ADMINISTRADOR'] }),
  );
  await usuarios.crear(
    usuarioFicticio({ id: 'u-1', correo: 'u1@ejemplo.pe', roles: ['CAJA', 'JEFATURA'] }),
  );
  const casoDeUso = new ReemplazarRoles({ usuarios, almacen, reloj: new RelojFalso(), eventos });
  return { usuarios, almacen, eventos, casoDeUso };
};

describe('ReemplazarRoles (FR-018, FR-019, FR-015, FR-020)', () => {
  it('retira los roles que ya no están (quién y cuándo) y crea los nuevos', async () => {
    const { almacen, eventos, casoDeUso } = await preparar();

    const usuario = await casoDeUso.ejecutar('u-1', ['JEFATURA', 'EVALUADOR'], 'admin-1');

    expect(usuario.rolesVigentes.sort()).toEqual(['EVALUADOR', 'JEFATURA']);
    const caja = usuario.asignaciones.find((a) => a.rol === 'CAJA');
    expect(caja?.esVigente).toBe(false);
    expect(caja?.retiradoPor).toBe('admin-1');
    expect(caja?.retiradoEn).toEqual(T0);
    expect(usuario.asignaciones.find((a) => a.rol === 'EVALUADOR')?.asignadoPor).toBe('admin-1');
    expect(almacen.versiones.get('u-1')).toBe(usuario.versionSeguridad);
    expect(eventos.registrados).toContainEqual({
      evento: 'roles-cambiados',
      ids: { usuarioId: 'u-1' },
    });
  });

  it('sin cambios no sube la versión ni registra el evento', async () => {
    const { usuarios, eventos, casoDeUso } = await preparar();
    const antes = (await usuarios.obtenerPorId('u-1'))?.versionSeguridad;

    const usuario = await casoDeUso.ejecutar('u-1', ['CAJA', 'JEFATURA'], 'admin-1');

    expect(usuario.versionSeguridad).toBe(antes);
    expect(eventos.nombres()).not.toContain('roles-cambiados');
    expect(usuarios.auditoria).toEqual([]);
  });

  it('registra un ROL_QUITADO y un ROL_ASIGNADO por rol, con el administrador (009)', async () => {
    const { usuarios, casoDeUso } = await preparar();

    await casoDeUso.ejecutar('u-1', ['JEFATURA', 'EVALUADOR'], 'admin-1');

    expect(
      usuarios.auditoria.map((e) => [e.accion, e.actorUsuarioId, e.afectadoUsuarioId, e.detalle]),
    ).toEqual([
      ['ROL_QUITADO', 'admin-1', 'u-1', { rol: 'CAJA' }],
      ['ROL_ASIGNADO', 'admin-1', 'u-1', { rol: 'EVALUADOR' }],
    ]);
  });

  it('no permite quitarle ADMINISTRADOR al último administrador (aunque sea él mismo)', async () => {
    const { usuarios, casoDeUso } = await preparar();

    await expect(casoDeUso.ejecutar('admin-1', ['JEFATURA'], 'admin-1')).rejects.toBeInstanceOf(
      ErrorUltimoAdministrador,
    );
    expect((await usuarios.obtenerPorId('admin-1'))?.rolesVigentes).toEqual(['ADMINISTRADOR']);
  });

  it('con otro administrador activo sí permite quitárselo', async () => {
    const { usuarios, casoDeUso } = await preparar();
    await usuarios.crear(
      usuarioFicticio({ id: 'admin-2', correo: 'a2@ejemplo.pe', roles: ['ADMINISTRADOR'] }),
    );

    const usuario = await casoDeUso.ejecutar('admin-1', ['JEFATURA'], 'admin-2');

    expect(usuario.rolesVigentes).toEqual(['JEFATURA']);
  });

  it('responde no encontrado si el usuario no existe', async () => {
    const { casoDeUso } = await preparar();

    await expect(casoDeUso.ejecutar('no-existe', ['CAJA'], 'admin-1')).rejects.toBeInstanceOf(
      ErrorUsuarioNoEncontrado,
    );
  });
});
