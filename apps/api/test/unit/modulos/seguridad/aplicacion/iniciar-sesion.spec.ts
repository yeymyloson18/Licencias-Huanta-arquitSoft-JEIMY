import {
  ErrorAutenticacion,
  ErrorDemasiadosIntentos,
} from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { ErrorLimitadorNoDisponible } from '../../../../../src/modulos/seguridad/dominio/puertos/limitador-intentos';
import { IniciarSesion } from '../../../../../src/modulos/seguridad/aplicacion/iniciar-sesion';
import { ErrorEnvioOtp } from '../../../../../src/modulos/seguridad/dominio/puertos/enviador-otp';
import {
  AuditoriaEnMemoria,
  EnviadorFalso,
  EventosFalsos,
  GeneradorFalso,
  HasherFalso,
  LimitadorFalso,
  ProtectorFalso,
  RelojFalso,
  RepositorioCodigosEnMemoria,
  RepositorioUsuariosEnMemoria,
  T0,
  usuarioFicticio,
} from './dobles';

const IP = '10.0.0.1';

const preparar = () => {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const codigos = new RepositorioCodigosEnMemoria();
  const hasher = new HasherFalso();
  const enviador = new EnviadorFalso();
  const eventos = new EventosFalsos();
  const reloj = new RelojFalso();
  const limitador = new LimitadorFalso();
  const auditoria = new AuditoriaEnMemoria();
  const casoDeUso = new IniciarSesion({
    usuarios,
    codigos,
    hasher,
    generador: new GeneradorFalso(),
    protector: new ProtectorFalso(),
    enviador,
    reloj,
    eventos,
    limitador,
    auditoria,
  });
  return { usuarios, codigos, hasher, enviador, eventos, reloj, limitador, auditoria, casoDeUso };
};

describe('IniciarSesion (paso 1)', () => {
  it('con credenciales correctas crea un código, lo envía y devuelve el desafío', async () => {
    const { usuarios, codigos, enviador, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());

    const desafio = await casoDeUso.ejecutar({
      ip: IP,
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
    await casoDeUso.ejecutar({ ip: IP, correo: 'persona@ejemplo.pe', clave: 'ClaveActual2026' });
    reloj.avanzar(30);

    await casoDeUso.ejecutar({ ip: IP, correo: 'persona@ejemplo.pe', clave: 'ClaveActual2026' });

    expect((await codigos.obtenerPorId('id-1'))?.verificar(true, reloj.ahora())).toBe('VENCIDO');
    expect((await codigos.obtenerPorId('id-2'))?.verificar(true, reloj.ahora())).toBe('CORRECTO');
  });

  it('con un correo inexistente verifica contra la huella ficticia y no autentica', async () => {
    const { hasher, enviador, eventos, casoDeUso } = preparar();

    await expect(
      casoDeUso.ejecutar({ ip: IP, correo: 'nadie@ejemplo.pe', clave: 'ClaveActual2026' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
    expect(hasher.verificacionesFicticias).toBe(1);
    expect(enviador.enviados).toHaveLength(0);
    expect(eventos.registrados).toEqual([{ evento: 'inicio-sesion-fallido', ids: {} }]);
  });

  it('registra el intento con un correo inexistente sin identificar a nadie (FR-014 de la 009)', async () => {
    const { auditoria, casoDeUso } = preparar();

    await expect(
      casoDeUso.ejecutar({ ip: IP, correo: 'nadie@ejemplo.pe', clave: 'ClaveActual2026' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);

    expect(auditoria.eventos).toHaveLength(1);
    expect(auditoria.eventos[0]).toMatchObject({
      accion: 'CLAVE_INCORRECTA',
      resultado: 'RECHAZADO',
      actorUsuarioId: null,
      afectadoUsuarioId: null,
      detalle: { motivo: 'CORREO_NO_REGISTRADO' },
    });
    expect(JSON.stringify(auditoria.eventos[0])).not.toContain('nadie');
  });

  it('si la auditoría falla, el intento responde igual y se avisa sin datos', async () => {
    const { auditoria, eventos, casoDeUso } = preparar();
    auditoria.falla = true;

    await expect(
      casoDeUso.ejecutar({ ip: IP, correo: 'nadie@ejemplo.pe', clave: 'x' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
    expect(eventos.nombres()).toContain('fallo-auditoria');
  });

  it('con un correo mal formado responde igual que con uno inexistente', async () => {
    const { hasher, casoDeUso } = preparar();

    await expect(
      casoDeUso.ejecutar({ ip: IP, correo: 'no-es-correo', clave: 'x' }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
    expect(hasher.verificacionesFicticias).toBe(1);
  });

  it.each([
    ['clave incorrecta', { clave: 'ClaveActual2026' }, 'OtraClave2026'],
    ['usuario inactivo', { activo: false }, 'ClaveActual2026'],
  ])('con %s lanza el mismo error y no envía el código', async (_, opciones, clave) => {
    const { usuarios, enviador, eventos, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio(opciones));

    await expect(
      casoDeUso.ejecutar({ ip: IP, correo: 'persona@ejemplo.pe', clave }),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
    expect(enviador.enviados).toHaveLength(0);
    expect(eventos.registrados).toEqual([
      { evento: 'inicio-sesion-fallido', ids: { usuarioId: 'usuario-1' } },
    ]);
  });

  it.each([
    ['clave incorrecta', { clave: 'ClaveActual2026' }, 'OtraClave2026', 'CLAVE'],
    ['usuario inactivo', { activo: false }, 'ClaveActual2026', 'CUENTA_INACTIVA'],
  ])(
    'con %s registra CLAVE_INCORRECTA sobre la cuenta, sin actor',
    async (_, opciones, clave, motivo) => {
      const { usuarios, auditoria, casoDeUso } = preparar();
      await usuarios.crear(usuarioFicticio(opciones));

      await casoDeUso
        .ejecutar({ ip: IP, correo: 'persona@ejemplo.pe', clave })
        .catch(() => undefined);

      expect(
        auditoria.eventos.map((e) => [e.accion, e.actorUsuarioId, e.afectadoUsuarioId, e.detalle]),
      ).toEqual([['CLAVE_INCORRECTA', null, 'usuario-1', { motivo }]]);
    },
  );

  it('con credenciales correctas registra solo el código enviado, sin el código (010)', async () => {
    const { usuarios, auditoria, enviador, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());

    const desafio = await casoDeUso.ejecutar({
      ip: IP,
      correo: 'persona@ejemplo.pe',
      clave: 'ClaveActual2026',
    });

    expect(auditoria.eventos).toHaveLength(1);
    expect(auditoria.eventos[0]).toMatchObject({
      accion: 'CODIGO_ENVIADO',
      resultado: 'EXITO',
      actorUsuarioId: null,
      afectadoUsuarioId: 'usuario-1',
      intentoId: desafio.desafioId,
      detalle: {
        proposito: 'INGRESO_PERSONAL',
        canal: 'SIMULADO',
        destino: '9*****321',
        entrega: 'ENTREGADO',
      },
    });
    const codigo = enviador.enviados[0]?.codigo ?? '';
    expect(codigo).toMatch(/^\d{6}$/);
    expect(JSON.stringify(auditoria.eventos)).not.toContain(codigo);
    expect(JSON.stringify(auditoria.eventos)).not.toContain('987654321');
  });

  it('si el envío falla lanza ErrorEnvioOtp y registra el código enviado como fallido (010)', async () => {
    const { usuarios, enviador, auditoria, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    enviador.falla = true;

    await expect(
      casoDeUso.ejecutar({ ip: IP, correo: 'persona@ejemplo.pe', clave: 'ClaveActual2026' }),
    ).rejects.toBeInstanceOf(ErrorEnvioOtp);
    expect(auditoria.eventos.map((e) => [e.accion, e.resultado, e.detalle.entrega])).toEqual([
      ['CODIGO_ENVIADO', 'RECHAZADO', 'FALLIDO'],
    ]);
  });
});

describe('IniciarSesion: límites de intentos (historia 4, contracts/autenticacion.md)', () => {
  const credenciales = { ip: IP, correo: 'persona@ejemplo.pe', clave: 'ClaveActual2026' };

  it('cada fallo suma al correo y a la IP; el 6.º intento se rechaza aunque sea correcto', async () => {
    const { usuarios, limitador, enviador, eventos, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    for (let i = 0; i < 5; i += 1) {
      await expect(
        casoDeUso.ejecutar({ ...credenciales, clave: 'Incorrecta2026' }),
      ).rejects.toBeInstanceOf(ErrorAutenticacion);
    }
    expect(limitador.fallos.get('correo:persona@ejemplo.pe')).toBe(5);

    const error = await casoDeUso.ejecutar(credenciales).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorDemasiadosIntentos);
    expect((error as ErrorDemasiadosIntentos).segundos).toBe(600);
    expect(enviador.enviados).toHaveLength(0);
    expect(eventos.nombres()).toContain('bloqueo-temporal');
  });

  it('el bloqueo de la cuenta queda como CUENTA_BLOQUEADA con los segundos (009)', async () => {
    const { usuarios, auditoria, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    for (let i = 0; i < 5; i += 1) {
      await casoDeUso.ejecutar({ ...credenciales, clave: 'Incorrecta2026' }).catch(() => undefined);
    }

    await casoDeUso.ejecutar(credenciales).catch(() => undefined);

    expect(auditoria.eventos.at(-1)).toMatchObject({
      accion: 'CUENTA_BLOQUEADA',
      afectadoUsuarioId: 'usuario-1',
      detalle: { segundos: 600 },
    });
  });

  it('el bloqueo solo del origen queda como ORIGEN_BLOQUEADO (009)', async () => {
    const { auditoria, casoDeUso } = preparar();
    for (let i = 0; i < 5; i += 1) {
      await casoDeUso
        .ejecutar({ ...credenciales, correo: `otro${String(i)}@ejemplo.pe` })
        .catch(() => undefined);
    }

    await casoDeUso
      .ejecutar({ ...credenciales, correo: 'nuevo@ejemplo.pe' })
      .catch(() => undefined);

    expect(auditoria.eventos.at(-1)).toMatchObject({
      accion: 'ORIGEN_BLOQUEADO',
      afectadoUsuarioId: null,
    });
  });

  it('un intento con credenciales correctas se devuelve: solo los fallos quedan contados', async () => {
    const { usuarios, limitador, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    for (let i = 0; i < 4; i += 1) {
      await casoDeUso.ejecutar({ ...credenciales, clave: 'Incorrecta2026' }).catch(() => undefined);
    }

    await casoDeUso.ejecutar(credenciales);

    expect(limitador.fallos.get('correo:persona@ejemplo.pe')).toBe(4);
    expect(limitador.fallos.get(`ip:${IP}`)).toBe(4);
  });

  it('un correo inexistente cuenta igual (no revela qué correos existen)', async () => {
    const { limitador, casoDeUso } = preparar();

    await casoDeUso
      .ejecutar({ ...credenciales, correo: 'nadie@ejemplo.pe' })
      .catch(() => undefined);

    expect(limitador.fallos.get('correo:nadie@ejemplo.pe')).toBe(1);
    expect(limitador.fallos.get(`ip:${IP}`)).toBe(1);
  });

  it('el 4.º código en 15 minutos se rechaza sin enviar SMS (FR-002a)', async () => {
    const { usuarios, enviador, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    for (let i = 0; i < 3; i += 1) {
      await casoDeUso.ejecutar(credenciales);
    }

    await expect(casoDeUso.ejecutar(credenciales)).rejects.toBeInstanceOf(ErrorDemasiadosIntentos);
    expect(enviador.enviados).toHaveLength(3);
  });

  it('el 4.º código registra el límite de códigos alcanzado sobre la cuenta (010)', async () => {
    const { usuarios, auditoria, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    for (let i = 0; i < 3; i += 1) {
      await casoDeUso.ejecutar(credenciales);
    }

    await casoDeUso.ejecutar(credenciales).catch(() => undefined);

    expect(auditoria.acciones()).toEqual([
      'CODIGO_ENVIADO',
      'CODIGO_ENVIADO',
      'CODIGO_ENVIADO',
      'CODIGO_LIMITE_ALCANZADO',
    ]);
    expect(auditoria.eventos.at(-1)).toMatchObject({
      afectadoUsuarioId: 'usuario-1',
      detalle: { proposito: 'INGRESO_PERSONAL', segundos: 300 },
    });
  });

  it('si los límites no están disponibles falla cerrado (FR-009)', async () => {
    const { usuarios, limitador, enviador, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    limitador.noDisponible = true;

    await expect(casoDeUso.ejecutar(credenciales)).rejects.toBeInstanceOf(
      ErrorLimitadorNoDisponible,
    );
    expect(enviador.enviados).toHaveLength(0);
  });

  it('si el envío falla no cuenta el envío', async () => {
    const { usuarios, limitador, enviador, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    enviador.falla = true;

    await expect(casoDeUso.ejecutar(credenciales)).rejects.toBeInstanceOf(ErrorEnvioOtp);
    expect(limitador.envios.get('usuario-1')).toBeUndefined();
  });

  it('un inicio exitoso no reinicia los contadores de fallos', async () => {
    const { usuarios, limitador, casoDeUso } = preparar();
    await usuarios.crear(usuarioFicticio());
    await casoDeUso.ejecutar({ ...credenciales, clave: 'Incorrecta2026' }).catch(() => undefined);

    await casoDeUso.ejecutar(credenciales);

    expect(limitador.fallos.get(`ip:${IP}`)).toBe(1);
  });
});
