import { ErrorAutenticacion } from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { RenovarSesion } from '../../../../../src/modulos/seguridad/aplicacion/renovar-sesion';
import { Sesion } from '../../../../../src/modulos/seguridad/dominio/sesion';
import {
  AlmacenFalso,
  EmisorFalso,
  EventosFalsos,
  GeneradorFalso,
  RelojFalso,
  RepositorioSesionesEnMemoria,
  RepositorioUsuariosEnMemoria,
  T0,
  usuarioFicticio,
} from './dobles';

const SID = 's-1';
const REFRESH = `${SID}.inicial`;

const preparar = async () => {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const sesiones = new RepositorioSesionesEnMemoria();
  const almacen = new AlmacenFalso();
  const eventos = new EventosFalsos();
  const reloj = new RelojFalso();
  const usuario = usuarioFicticio();
  await usuarios.crear(usuario);
  await sesiones.crear(
    Sesion.crear({ id: SID, usuarioId: usuario.id, refreshHash: `sha:${REFRESH}`, creadaEn: T0 }),
  );
  await sesiones.crear(
    Sesion.crear({ id: 's-2', usuarioId: usuario.id, refreshHash: 'sha:s-2.x', creadaEn: T0 }),
  );
  const casoDeUso = new RenovarSesion({
    sesiones,
    usuarios,
    generador: new GeneradorFalso(),
    emisor: new EmisorFalso(),
    reloj,
    eventos,
    almacen,
  });
  return { usuario, usuarios, sesiones, almacen, eventos, reloj, casoDeUso };
};

const rechaza = (promesa: Promise<unknown>) =>
  expect(promesa).rejects.toBeInstanceOf(ErrorAutenticacion);

describe('RenovarSesion', () => {
  it('con el refresh vigente rota y entrega un token nuevo', async () => {
    const { sesiones, reloj, casoDeUso } = await preparar();
    reloj.avanzar(13 * 60);

    const resultado = await casoDeUso.ejecutar({ refreshToken: REFRESH });

    expect(resultado.refreshToken).toBe(`${SID}.r1`);
    expect(resultado.accessToken).toContain(`:${SID}:`);
    const sesion = await sesiones.obtenerPorId(SID);
    expect(sesion?.refreshHash).toBe(`sha:${SID}.r1`);
    expect(sesion?.ultimaActividadEn).toEqual(reloj.ahora());
  });

  it('reutilizar el refresh rotado pasados 10 s revoca todas las sesiones del usuario', async () => {
    const { sesiones, almacen, eventos, reloj, casoDeUso } = await preparar();
    await casoDeUso.ejecutar({ refreshToken: REFRESH });
    reloj.avanzar(11);

    await rechaza(casoDeUso.ejecutar({ refreshToken: REFRESH }));

    expect((await sesiones.obtenerPorId(SID))?.revocada).toBe(true);
    expect((await sesiones.obtenerPorId('s-2'))?.revocada).toBe(true);
    expect(almacen.revocadas.sort()).toEqual([SID, 's-2']);
    expect(eventos.registrados).toContainEqual({
      evento: 'reutilizacion-refresh',
      ids: { usuarioId: 'usuario-1', sesionId: SID },
    });
  });

  it('el refresh rotado dentro de 10 s (dos pestañas) no autentica, pero no revoca nada', async () => {
    const { sesiones, almacen, reloj, casoDeUso } = await preparar();
    await casoDeUso.ejecutar({ refreshToken: REFRESH });
    reloj.avanzar(5);

    await rechaza(casoDeUso.ejecutar({ refreshToken: REFRESH }));

    expect((await sesiones.obtenerPorId(SID))?.revocada).toBe(false);
    expect(almacen.revocadas).toEqual([]);
  });

  it('pasadas 8 horas no renueva', async () => {
    const { reloj, casoDeUso } = await preparar();
    reloj.avanzar(8 * 3600);

    await rechaza(casoDeUso.ejecutar({ refreshToken: REFRESH }));
  });

  it('con más de 30 minutos desde la última renovación no renueva (FR-003a)', async () => {
    const { reloj, casoDeUso } = await preparar();
    reloj.avanzar(30 * 60 + 1);

    await rechaza(casoDeUso.ejecutar({ refreshToken: REFRESH }));
  });

  it('una sesión revocada no renueva', async () => {
    const { sesiones, casoDeUso } = await preparar();
    const sesion = await sesiones.obtenerPorId(SID);
    sesion?.revocar(T0);

    await rechaza(casoDeUso.ejecutar({ refreshToken: REFRESH }));
  });

  it.each(['', 'sin-punto', 's-1.otro-secreto', 'no-existe.secreto'])(
    'un refresh desconocido o mal formado (%p) no autentica',
    async (token) => {
      const { casoDeUso } = await preparar();

      await rechaza(casoDeUso.ejecutar({ refreshToken: token }));
    },
  );

  it('si el usuario está inactivo no renueva', async () => {
    const { usuario, usuarios, casoDeUso } = await preparar();
    usuario.desactivar();
    await usuarios.guardar(usuario);

    await rechaza(casoDeUso.ejecutar({ refreshToken: REFRESH }));
  });
});
