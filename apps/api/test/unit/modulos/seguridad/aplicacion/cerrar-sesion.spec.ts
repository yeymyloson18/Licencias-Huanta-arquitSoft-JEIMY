import { CerrarSesion } from '../../../../../src/modulos/seguridad/aplicacion/cerrar-sesion';
import { Sesion } from '../../../../../src/modulos/seguridad/dominio/sesion';
import {
  AlmacenFalso,
  GeneradorFalso,
  RelojFalso,
  RepositorioSesionesEnMemoria,
  T0,
} from './dobles';

const preparar = async () => {
  const sesiones = new RepositorioSesionesEnMemoria();
  const almacen = new AlmacenFalso();
  await sesiones.crear(
    Sesion.crear({ id: 's-1', usuarioId: 'u-1', refreshHash: 'sha:s-1.secreto', creadaEn: T0 }),
  );
  const casoDeUso = new CerrarSesion({
    sesiones,
    generador: new GeneradorFalso(),
    reloj: new RelojFalso(),
    almacen,
  });
  return { sesiones, almacen, casoDeUso };
};

describe('CerrarSesion', () => {
  it('revoca la sesión y marca su sid como revocado después de guardarla', async () => {
    const { sesiones, almacen, casoDeUso } = await preparar();

    await casoDeUso.ejecutar({ refreshToken: 's-1.secreto' });

    expect((await sesiones.obtenerPorId('s-1'))?.revocada).toBe(true);
    expect(almacen.revocadas).toEqual(['s-1']);
  });

  it('guarda CIERRE_SESION junto con la sesión revocada, sin origen (009)', async () => {
    const { sesiones, casoDeUso } = await preparar();

    await casoDeUso.ejecutar({ refreshToken: 's-1.secreto' });

    expect(sesiones.auditoria).toHaveLength(1);
    expect(sesiones.auditoria[0]).toMatchObject({
      accion: 'CIERRE_SESION',
      actorUsuarioId: 'u-1',
      afectadoUsuarioId: 'u-1',
      origenHmac: null,
      ocurridoEn: T0,
    });
  });

  it.each([undefined, '', 'basura', 'no-existe.secreto'])(
    'sin una sesión válida (%p) no falla ni revoca nada',
    async (token) => {
      const { almacen, casoDeUso } = await preparar();

      await expect(casoDeUso.ejecutar({ refreshToken: token })).resolves.toBeUndefined();
      expect(almacen.revocadas).toEqual([]);
    },
  );

  it('no cierra una sesión ajena si solo se conoce su id (exige su refresh)', async () => {
    const { sesiones, almacen, casoDeUso } = await preparar();

    await casoDeUso.ejecutar({ refreshToken: 's-1.adivinado' });

    expect((await sesiones.obtenerPorId('s-1'))?.revocada).toBe(false);
    expect(almacen.revocadas).toEqual([]);
  });

  it('cerrar dos veces es idempotente', async () => {
    const { almacen, casoDeUso } = await preparar();
    await casoDeUso.ejecutar({ refreshToken: 's-1.secreto' });

    await casoDeUso.ejecutar({ refreshToken: 's-1.secreto' });

    expect(almacen.revocadas).toEqual(['s-1']);
  });
});
