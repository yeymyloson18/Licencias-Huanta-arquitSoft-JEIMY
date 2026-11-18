import { ErrorAutenticacion } from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { VerificarOtp } from '../../../../../src/modulos/seguridad/aplicacion/verificar-otp';
import { CodigoOtp } from '../../../../../src/modulos/seguridad/dominio/codigo-otp';
import {
  EmisorFalso,
  EventosFalsos,
  GeneradorFalso,
  RelojFalso,
  RepositorioCodigosEnMemoria,
  RepositorioSesionesEnMemoria,
  RepositorioUsuariosEnMemoria,
  T0,
  usuarioFicticio,
  type OpcionesUsuario,
} from './dobles';

const preparar = async (opciones: OpcionesUsuario = {}) => {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const codigos = new RepositorioCodigosEnMemoria();
  const sesiones = new RepositorioSesionesEnMemoria();
  const emisor = new EmisorFalso();
  const eventos = new EventosFalsos();
  const reloj = new RelojFalso();
  const usuario = usuarioFicticio(opciones);
  await usuarios.crear(usuario);
  await codigos.crear(
    CodigoOtp.crear({
      id: 'desafio-1',
      usuarioId: usuario.id,
      destinoHmac: new Uint8Array([1]),
      codigoHash: 'hmac:desafio-1:654321',
      creadoEn: T0,
    }),
  );
  const casoDeUso = new VerificarOtp({
    codigos,
    usuarios,
    sesiones,
    generador: new GeneradorFalso(),
    emisor,
    reloj,
    eventos,
  });
  return { usuarios, usuario, codigos, sesiones, emisor, eventos, reloj, casoDeUso };
};

describe('VerificarOtp (paso 2)', () => {
  it('con el código correcto abre una sesión de 8 h y firma el token', async () => {
    const { usuario, sesiones, emisor, eventos, casoDeUso } = await preparar();

    const resultado = await casoDeUso.ejecutar({ desafioId: 'desafio-1', codigo: '654321' });

    expect(resultado.accessToken).toBe(
      `token:usuario-1:id-1:${String(usuario.versionSeguridad)}:false`,
    );
    expect(resultado.expiraEn).toBe(900);
    expect(resultado.refreshToken).toBe('id-1.r1');
    expect(resultado.venceMaximoEn).toEqual(new Date(T0.getTime() + 8 * 3_600_000));
    expect(resultado.usuario.id).toBe('usuario-1');
    expect(emisor.firmados[0]).toEqual({
      sub: 'usuario-1',
      sid: 'id-1',
      roles: ['CAJA'],
      vs: usuario.versionSeguridad,
      dcc: false,
    });
    const sesion = await sesiones.obtenerPorId('id-1');
    expect(sesion?.refreshHash).toBe('sha:id-1.r1');
    expect(eventos.registrados).toEqual([
      { evento: 'inicio-sesion-exitoso', ids: { usuarioId: 'usuario-1', sesionId: 'id-1' } },
    ]);
  });

  it('con clave temporal el token lleva dcc = true', async () => {
    const { emisor, casoDeUso } = await preparar({ debeCambiarClave: true });

    const resultado = await casoDeUso.ejecutar({ desafioId: 'desafio-1', codigo: '654321' });

    expect(emisor.firmados[0]?.dcc).toBe(true);
    expect(resultado.usuario.debeCambiarClave).toBe(true);
  });

  it('con un código incorrecto suma un intento y no autentica', async () => {
    const { codigos, sesiones, eventos, casoDeUso } = await preparar();

    await expect(
      casoDeUso.ejecutar({ desafioId: 'desafio-1', codigo: '000000' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
    expect((await codigos.obtenerPorId('desafio-1'))?.intentos).toBe(1);
    expect(sesiones.sesiones.size).toBe(0);
    expect(eventos.nombres()).toEqual(['inicio-sesion-fallido']);
  });

  it('un código vencido no autentica', async () => {
    const { reloj, casoDeUso } = await preparar();
    reloj.avanzar(301);

    await expect(
      casoDeUso.ejecutar({ desafioId: 'desafio-1', codigo: '654321' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('un código usado no vuelve a servir', async () => {
    const { casoDeUso } = await preparar();
    await casoDeUso.ejecutar({ desafioId: 'desafio-1', codigo: '654321' });

    await expect(
      casoDeUso.ejecutar({ desafioId: 'desafio-1', codigo: '654321' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('un código agotado (5 fallos) no autentica aunque sea correcto', async () => {
    const { casoDeUso } = await preparar();
    for (let i = 0; i < 5; i += 1) {
      await casoDeUso.ejecutar({ desafioId: 'desafio-1', codigo: '000000' }).catch(() => undefined);
    }

    await expect(
      casoDeUso.ejecutar({ desafioId: 'desafio-1', codigo: '654321' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('un desafío inexistente no autentica', async () => {
    const { casoDeUso } = await preparar();

    await expect(
      casoDeUso.ejecutar({ desafioId: 'otro', codigo: '654321' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('si el usuario se desactivó entre el paso 1 y el 2 no autentica', async () => {
    const { usuario, usuarios, sesiones, casoDeUso } = await preparar();
    usuario.desactivar();
    await usuarios.guardar(usuario);

    await expect(
      casoDeUso.ejecutar({ desafioId: 'desafio-1', codigo: '654321' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
    expect(sesiones.sesiones.size).toBe(0);
  });
});
