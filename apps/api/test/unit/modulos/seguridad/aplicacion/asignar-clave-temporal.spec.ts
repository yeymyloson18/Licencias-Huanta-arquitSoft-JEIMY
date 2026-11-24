import { AsignarClaveTemporal } from '../../../../../src/modulos/seguridad/aplicacion/asignar-clave-temporal';
import {
  ErrorClaveInvalida,
  ErrorUsuarioNoEncontrado,
} from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { Sesion } from '../../../../../src/modulos/seguridad/dominio/sesion';
import {
  AlmacenFalso,
  EventosFalsos,
  HasherFalso,
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
  await usuarios.crear(usuarioFicticio({ id: 'u-1', clave: 'ClaveVieja2026' }));
  await sesiones.crear(
    Sesion.crear({ id: 's-1', usuarioId: 'u-1', refreshHash: 'h', creadaEn: T0 }),
  );
  const casoDeUso = new AsignarClaveTemporal({
    usuarios,
    sesiones,
    hasher: new HasherFalso(),
    almacen,
    reloj: new RelojFalso(),
    eventos,
  });
  return { usuarios, sesiones, almacen, eventos, casoDeUso };
};

describe('AsignarClaveTemporal (FR-022b)', () => {
  it('guarda la clave temporal, exige cambiarla, sube la versión y revoca todas las sesiones', async () => {
    const { usuarios, sesiones, almacen, eventos, casoDeUso } = await preparar();
    const versionAntes = (await usuarios.obtenerPorId('u-1'))?.versionSeguridad ?? 0;

    await casoDeUso.ejecutar('u-1', 'ClaveTemporalNueva2026', 'admin-1');
    expect(
      usuarios.auditoria.map((e) => [e.accion, e.actorUsuarioId, e.afectadoUsuarioId]),
    ).toEqual([['CLAVE_TEMPORAL_ASIGNADA', 'admin-1', 'u-1']]);
    expect(JSON.stringify(usuarios.auditoria)).not.toContain('ClaveTemporalNueva2026');

    const usuario = await usuarios.obtenerPorId('u-1');
    expect(usuario?.claveHash).toBe('h:ClaveTemporalNueva2026');
    expect(usuario?.debeCambiarClave).toBe(true);
    expect(usuario?.versionSeguridad).toBe(versionAntes + 1);
    expect((await sesiones.obtenerPorId('s-1'))?.revocada).toBe(true);
    expect(almacen.revocadas).toEqual(['s-1']);
    expect(almacen.versiones.get('u-1')).toBe(versionAntes + 1);
    expect(eventos.registrados).toContainEqual({
      evento: 'clave-temporal-asignada',
      ids: { usuarioId: 'u-1' },
    });
  });

  it('rechaza una clave que no cumple la política', async () => {
    const { usuarios, casoDeUso } = await preparar();

    await expect(casoDeUso.ejecutar('u-1', 'corta', 'admin-1')).rejects.toBeInstanceOf(
      ErrorClaveInvalida,
    );
    expect((await usuarios.obtenerPorId('u-1'))?.claveHash).toBe('h:ClaveVieja2026');
  });

  it('responde no encontrado si el usuario no existe', async () => {
    const { casoDeUso } = await preparar();

    await expect(
      casoDeUso.ejecutar('no-existe', 'ClaveTemporal2026', 'admin-1'),
    ).rejects.toBeInstanceOf(ErrorUsuarioNoEncontrado);
  });
});
