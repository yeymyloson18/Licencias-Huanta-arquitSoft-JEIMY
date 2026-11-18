import { ErrorAutenticacion } from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { IniciarSesion } from '../../../../../src/modulos/seguridad/aplicacion/iniciar-sesion';
import { ErrorEnvioOtp } from '../../../../../src/modulos/seguridad/dominio/puertos/enviador-otp';
import {
  EnviadorFalso,
  EventosFalsos,
  GeneradorFalso,
  HasherFalso,
  ProtectorFalso,
  RelojFalso,
  RepositorioCodigosEnMemoria,
  RepositorioUsuariosEnMemoria,
  T0,
  usuarioFicticio,
} from './dobles';

const preparar = () => {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const codigos = new RepositorioCodigosEnMemoria();
  const hasher = new HasherFalso();
  const enviador = new EnviadorFalso();
  const eventos = new EventosFalsos();
  const reloj = new RelojFalso();
  const casoDeUso = new IniciarSesion({
    usuarios,
    codigos,
    hasher,
    generador: new GeneradorFalso(),
    protector: new ProtectorFalso(),
    enviador,
    reloj,
    eventos,
  });
  return { usuarios, codigos, hasher, enviador, eventos, reloj, casoDeUso };
};

describe('IniciarSesion (paso 1)', () => {
  it('con credenciales correctas crea un código, lo envía y devuelve el desafío', async () => {
    const { usuarios, codigos, enviador, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());

    const desafio = await casoDeUso.ejecutar({
      correo: 'Persona@Ejemplo.pe',
      clave: 'ClaveActual2026',
    });

    expect(desafio).toEqual({
      desafioId: 'id-1',
      venceEn: new Date(T0.getTime() + 300_000),
      celularEnmascarado: '9*****321',
    });
    expect(enviador.enviados).toEqual([
      { destino: '987654321', codigo: '123456', usuarioId: 'usuario-1' },
    ]);
    const guardado = await codigos.obtenerPorId('id-1');
    expect(guardado?.codigoHash).toBe('hmac:id-1:123456');
    expect(guardado?.usuarioId).toBe('usuario-1');
  });

  it('pedir otro código vence el anterior (FR-002)', async () => {
    const { usuarios, codigos, reloj, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    await casoDeUso.ejecutar({ correo: 'persona@ejemplo.pe', clave: 'ClaveActual2026' });
    reloj.avanzar(30);

    await casoDeUso.ejecutar({ correo: 'persona@ejemplo.pe', clave: 'ClaveActual2026' });

    expect((await codigos.obtenerPorId('id-1'))?.verificar(true, reloj.ahora())).toBe('VENCIDO');
    expect((await codigos.obtenerPorId('id-2'))?.verificar(true, reloj.ahora())).toBe('CORRECTO');
  });

  it('con un correo inexistente verifica contra la huella ficticia y no autentica', async () => {
    const { hasher, enviador, eventos, casoDeUso } = preparar();

    await expect(
      casoDeUso.ejecutar({ correo: 'nadie@ejemplo.pe', clave: 'ClaveActual2026' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
    expect(hasher.verificacionesFicticias).toBe(1);
    expect(enviador.enviados).toHaveLength(0);
    expect(eventos.registrados).toEqual([{ evento: 'inicio-sesion-fallido', ids: {} }]);
  });

  it('con un correo mal formado responde igual que con uno inexistente', async () => {
    const { hasher, casoDeUso } = preparar();

    await expect(casoDeUso.ejecutar({ correo: 'no-es-correo', clave: 'x' })).rejects.toBeInstanceOf(
      ErrorAutenticacion,
    );
    expect(hasher.verificacionesFicticias).toBe(1);
  });

  it.each([
    ['clave incorrecta', { clave: 'ClaveActual2026' }, 'OtraClave2026'],
    ['usuario inactivo', { activo: false }, 'ClaveActual2026'],
  ])('con %s lanza el mismo error y no envía el código', async (_, opciones, clave) => {
    const { usuarios, enviador, eventos, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio(opciones));

    await expect(
      casoDeUso.ejecutar({ correo: 'persona@ejemplo.pe', clave }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
    expect(enviador.enviados).toHaveLength(0);
    expect(eventos.registrados).toEqual([
      { evento: 'inicio-sesion-fallido', ids: { usuarioId: 'usuario-1' } },
    ]);
  });

  it('si el envío falla lanza ErrorEnvioOtp', async () => {
    const { usuarios, enviador, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    enviador.falla = true;

    await expect(
      casoDeUso.ejecutar({ correo: 'persona@ejemplo.pe', clave: 'ClaveActual2026' }),
    ).rejects.toBeInstanceOf(ErrorEnvioOtp);
  });
});
