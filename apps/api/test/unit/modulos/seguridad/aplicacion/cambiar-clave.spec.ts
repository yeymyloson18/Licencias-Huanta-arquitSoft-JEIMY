import { CambiarClave } from '../../../../../src/modulos/seguridad/aplicacion/cambiar-clave';
import {
  ErrorAutenticacion,
  ErrorClaveInvalida,
  ErrorDemasiadosIntentos,
} from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { Sesion } from '../../../../../src/modulos/seguridad/dominio/sesion';
import {
  AlmacenFalso,
  EmisorFalso,
  EventosFalsos,
  GeneradorFalso,
  HasherFalso,
  LimitadorFalso,
  RelojFalso,
  RepositorioSesionesEnMemoria,
  RepositorioUsuariosEnMemoria,
  T0,
  usuarioFicticio,
} from './dobles';

const preparar = async (claveTemporal = true) => {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const sesiones = new RepositorioSesionesEnMemoria();
  const almacen = new AlmacenFalso();
  const emisor = new EmisorFalso();
  const eventos = new EventosFalsos();
  const limitador = new LimitadorFalso();
  const usuario = usuarioFicticio({ clave: 'ClaveTemporal2026', debeCambiarClave: claveTemporal });
  await usuarios.crear(usuario);
  for (const id of ['actual', 'otra-1', 'otra-2']) {
    await sesiones.crear(
      Sesion.crear({ id, usuarioId: usuario.id, refreshHash: `sha:${id}.x`, creadaEn: T0 }),
    );
  }
  const casoDeUso = new CambiarClave({
    usuarios,
    sesiones,
    hasher: new HasherFalso(),
    generador: new GeneradorFalso(),
    emisor,
    reloj: new RelojFalso(),
    eventos,
    almacen,
    limitador,
  });
  return { usuario, usuarios, sesiones, almacen, emisor, eventos, limitador, casoDeUso };
};

const entrada = (claveActual: string, claveNueva: string) => ({
  usuarioId: 'usuario-1',
  sesionId: 'actual',
  ip: '10.0.0.1',
  claveActual,
  claveNueva,
});

describe('CambiarClave', () => {
  it('guarda la huella nueva, quita la clave temporal e incrementa la versión', async () => {
    const { usuario, usuarios, casoDeUso } = await preparar();
    const versionAntes = usuario.versionSeguridad;

    await casoDeUso.ejecutar(entrada('ClaveTemporal2026', 'ClaveDefinitiva2026'));

    const guardado = await usuarios.obtenerPorId('usuario-1');
    expect(guardado?.claveHash).toBe('h:ClaveDefinitiva2026');
    expect(guardado?.debeCambiarClave).toBe(false);
    expect(guardado?.versionSeguridad).toBe(versionAntes + 1);
  });

  it('guarda CLAVE_CAMBIADA con el cambio, sin la clave (009)', async () => {
    const { usuarios, casoDeUso } = await preparar();

    await casoDeUso.ejecutar(entrada('ClaveTemporal2026', 'ClaveDefinitiva2026'));

    expect(
      usuarios.auditoria.map((e) => [e.accion, e.actorUsuarioId, e.afectadoUsuarioId]),
    ).toEqual([['CLAVE_CAMBIADA', 'usuario-1', 'usuario-1']]);
    expect(JSON.stringify(usuarios.auditoria)).not.toContain('ClaveDefinitiva2026');
  });

  it('con clave definitiva (cambio voluntario, 011) cambia la clave y registra CLAVE_CAMBIADA con actor = afectado', async () => {
    const { usuarios, sesiones, casoDeUso } = await preparar(false);
    expect((await usuarios.obtenerPorId('usuario-1'))?.debeCambiarClave).toBe(false);

    const resultado = await casoDeUso.ejecutar(entrada('ClaveTemporal2026', 'ClaveVoluntaria2026'));

    expect((await usuarios.obtenerPorId('usuario-1'))?.claveHash).toBe('h:ClaveVoluntaria2026');
    expect(resultado.usuario.debeCambiarClave).toBe(false);
    expect(
      usuarios.auditoria.map((e) => [e.accion, e.actorUsuarioId, e.afectadoUsuarioId]),
    ).toEqual([['CLAVE_CAMBIADA', 'usuario-1', 'usuario-1']]);
    expect(JSON.stringify(usuarios.auditoria)).not.toContain('ClaveVoluntaria2026');
    expect((await sesiones.obtenerPorId('otra-1'))?.revocada).toBe(true);
    expect((await sesiones.obtenerPorId('actual'))?.revocada).toBe(false);
  });

  it('revoca las demás sesiones, rota la actual y devuelve un token sin clave temporal', async () => {
    const { sesiones, almacen, emisor, eventos, casoDeUso } = await preparar();

    const resultado = await casoDeUso.ejecutar(entrada('ClaveTemporal2026', 'ClaveDefinitiva2026'));

    expect((await sesiones.obtenerPorId('otra-1'))?.revocada).toBe(true);
    expect((await sesiones.obtenerPorId('otra-2'))?.revocada).toBe(true);
    const actual = await sesiones.obtenerPorId('actual');
    expect(actual?.revocada).toBe(false);
    expect(actual?.refreshHash).toBe(`sha:${resultado.refreshToken}`);
    expect(almacen.revocadas.sort()).toEqual(['otra-1', 'otra-2']);
    expect(emisor.firmados[0]?.dcc).toBe(false);
    expect(resultado.usuario.debeCambiarClave).toBe(false);
    expect(eventos.registrados).toContainEqual({
      evento: 'clave-cambiada',
      ids: { usuarioId: 'usuario-1', sesionId: 'actual' },
    });
  });

  it('publica la versión nueva de seguridad después de guardar (T050)', async () => {
    const { usuario, almacen, casoDeUso } = await preparar();

    await casoDeUso.ejecutar(entrada('ClaveTemporal2026', 'ClaveDefinitiva2026'));

    expect(almacen.versiones.get('usuario-1')).toBe(usuario.versionSeguridad);
  });

  it('con la clave actual incorrecta no autentica y no cambia nada', async () => {
    const { usuarios, casoDeUso } = await preparar();

    await expect(
      casoDeUso.ejecutar(entrada('Incorrecta2026', 'ClaveDefinitiva2026')),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
    expect(usuarios.guardados).toBe(0);
  });

  it('rechaza una clave nueva que no cumple la política, con las reglas incumplidas', async () => {
    const { casoDeUso } = await preparar();

    const error = await casoDeUso
      .ejecutar(entrada('ClaveTemporal2026', 'corta'))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorClaveInvalida);
    expect((error as ErrorClaveInvalida).reglas).toEqual(['LONGITUD_MINIMA', 'SIN_NUMERO']);
  });

  it('rechaza una clave nueva igual a la actual', async () => {
    const { casoDeUso } = await preparar();

    const error = await casoDeUso
      .ejecutar(entrada('ClaveTemporal2026', 'ClaveTemporal2026'))
      .catch((e: unknown) => e);

    expect((error as ErrorClaveInvalida).reglas).toEqual(['IGUAL_A_LA_ACTUAL']);
  });

  it('si la sesión actual ya no está vigente no autentica', async () => {
    const { sesiones, casoDeUso } = await preparar();
    (await sesiones.obtenerPorId('actual'))?.revocar(T0);

    await expect(
      casoDeUso.ejecutar(entrada('ClaveTemporal2026', 'ClaveDefinitiva2026')),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });
});

describe('CambiarClave: límites de intentos (historia 4)', () => {
  it('la clave actual incorrecta cuenta como fallo y a los 5 se bloquea', async () => {
    const { limitador, casoDeUso } = await preparar();
    for (let i = 0; i < 5; i += 1) {
      await casoDeUso
        .ejecutar(entrada('Incorrecta2026', 'ClaveDefinitiva2026'))
        .catch(() => undefined);
    }
    expect(limitador.fallos.get('correo:persona@ejemplo.pe')).toBe(5);

    await expect(
      casoDeUso.ejecutar(entrada('ClaveTemporal2026', 'ClaveDefinitiva2026')),
    ).rejects.toBeInstanceOf(ErrorDemasiadosIntentos);
  });

  it('si los límites no están disponibles sigue sin límite (ya exige una sesión válida)', async () => {
    const { limitador, casoDeUso } = await preparar();
    limitador.noDisponible = true;

    await expect(
      casoDeUso.ejecutar(entrada('ClaveTemporal2026', 'ClaveDefinitiva2026')),
    ).resolves.toMatchObject({ usuario: { debeCambiarClave: false } });
  });
});
