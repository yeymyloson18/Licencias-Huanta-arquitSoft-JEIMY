import { CerrarSesionesDeUsuario } from '../../../../../src/modulos/seguridad/aplicacion/cerrar-sesiones-de-usuario';
import { DesbloquearCuenta } from '../../../../../src/modulos/seguridad/aplicacion/desbloquear-cuenta';
import { ErrorUsuarioNoEncontrado } from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { ObtenerFichaUsuario } from '../../../../../src/modulos/seguridad/aplicacion/obtener-ficha-usuario';
import { eventoPropio } from '../../../../../src/modulos/seguridad/dominio/evento-auditoria';
import { ErrorLimitadorNoDisponible } from '../../../../../src/modulos/seguridad/dominio/puertos/limitador-intentos';
import {
  ErrorAccionSobreSiMismo,
  ReglasAccionesAdministrador,
} from '../../../../../src/modulos/seguridad/dominio/reglas-acciones-administrador';
import { Sesion } from '../../../../../src/modulos/seguridad/dominio/sesion';
import {
  AlmacenFalso,
  AuditoriaEnMemoria,
  BloqueosFalsos,
  ConsultaPanelFalsa,
  RelojFalso,
  RepositorioSesionesEnMemoria,
  RepositorioUsuariosEnMemoria,
  T0,
  usuarioFicticio,
} from './dobles';

describe('ReglasAccionesAdministrador (FR-018 de la 009)', () => {
  it('rechaza cerrar sus propias sesiones y desbloquearse; permite hacerlo sobre otro', () => {
    expect(() => {
      ReglasAccionesAdministrador.verificar('CERRAR_SESIONES', 'admin-1', 'admin-1');
    }).toThrow(ErrorAccionSobreSiMismo);
    expect(() => {
      ReglasAccionesAdministrador.verificar('DESBLOQUEAR', 'admin-1', 'admin-1');
    }).toThrow('propia cuenta');
    expect(() => {
      ReglasAccionesAdministrador.verificar('DESBLOQUEAR', 'admin-1', 'usuario-1');
    }).not.toThrow();
  });
});

describe('CerrarSesionesDeUsuario (FR-016 de la 009)', () => {
  const preparar = async () => {
    const usuarios = new RepositorioUsuariosEnMemoria();
    const sesiones = new RepositorioSesionesEnMemoria();
    const almacen = new AlmacenFalso();
    await usuarios.crear(usuarioFicticio());
    for (const id of ['s-1', 's-2']) {
      await sesiones.crear(
        Sesion.crear({ id, usuarioId: 'usuario-1', refreshHash: 'h', creadaEn: T0 }),
      );
    }
    const casoDeUso = new CerrarSesionesDeUsuario({
      usuarios,
      sesiones,
      almacen,
      reloj: new RelojFalso(),
    });
    return { usuarios, sesiones, almacen, casoDeUso };
  };

  it('revoca todas sus sesiones, las marca en la caché y no lo desactiva', async () => {
    const { usuarios, sesiones, almacen, casoDeUso } = await preparar();

    await expect(casoDeUso.ejecutar('usuario-1', 'admin-1')).resolves.toBe(2);

    expect((await sesiones.obtenerPorId('s-1'))?.revocada).toBe(true);
    expect(almacen.revocadas).toEqual(['s-1', 's-2']);
    expect((await usuarios.obtenerPorId('usuario-1'))?.activo).toBe(true);
  });

  it('registra SESIONES_CERRADAS con la cantidad, junto con la revocación', async () => {
    const { sesiones, casoDeUso } = await preparar();

    await casoDeUso.ejecutar('usuario-1', 'admin-1');

    expect(sesiones.auditoria.map((e) => [e.accion, e.actorUsuarioId, e.detalle])).toEqual([
      ['SESIONES_CERRADAS', 'admin-1', { sesiones: 2 }],
    ]);
  });

  it('sin sesiones abiertas responde 0 y también lo registra', async () => {
    const { sesiones, casoDeUso } = await preparar();
    await casoDeUso.ejecutar('usuario-1', 'admin-1');

    await expect(casoDeUso.ejecutar('usuario-1', 'admin-1')).resolves.toBe(0);
    expect(sesiones.auditoria.at(-1)?.detalle).toEqual({ sesiones: 0 });
  });

  it('no sobre sí mismo ni sobre un usuario que no existe', async () => {
    const { casoDeUso } = await preparar();

    await expect(casoDeUso.ejecutar('admin-1', 'admin-1')).rejects.toBeInstanceOf(
      ErrorAccionSobreSiMismo,
    );
    await expect(casoDeUso.ejecutar('no-existe', 'admin-1')).rejects.toBeInstanceOf(
      ErrorUsuarioNoEncontrado,
    );
  });
});

describe('DesbloquearCuenta (FR-017 de la 009)', () => {
  const preparar = async () => {
    const usuarios = new RepositorioUsuariosEnMemoria();
    const bloqueos = new BloqueosFalsos();
    const auditoria = new AuditoriaEnMemoria();
    await usuarios.crear(usuarioFicticio());
    bloqueos.bloqueadas.set('persona@ejemplo.pe', new Date(T0.getTime() + 600_000));
    const casoDeUso = new DesbloquearCuenta({
      usuarios,
      bloqueos,
      auditoria,
      reloj: new RelojFalso(),
    });
    return { bloqueos, auditoria, casoDeUso };
  };

  it('borra el bloqueo de la cuenta y registra CUENTA_DESBLOQUEADA', async () => {
    const { bloqueos, auditoria, casoDeUso } = await preparar();

    await casoDeUso.ejecutar('usuario-1', 'admin-1');

    expect(bloqueos.bloqueadas.size).toBe(0);
    expect(auditoria.eventos.map((e) => [e.accion, e.actorUsuarioId, e.afectadoUsuarioId])).toEqual(
      [['CUENTA_DESBLOQUEADA', 'admin-1', 'usuario-1']],
    );
  });

  it('si el servicio de bloqueos no responde, lanza y no registra nada', async () => {
    const { bloqueos, auditoria, casoDeUso } = await preparar();
    bloqueos.noDisponible = true;

    await expect(casoDeUso.ejecutar('usuario-1', 'admin-1')).rejects.toBeInstanceOf(
      ErrorLimitadorNoDisponible,
    );
    expect(auditoria.eventos).toEqual([]);
  });

  it('no sobre sí mismo ni sobre un usuario que no existe', async () => {
    const { casoDeUso } = await preparar();

    await expect(casoDeUso.ejecutar('admin-1', 'admin-1')).rejects.toBeInstanceOf(
      ErrorAccionSobreSiMismo,
    );
    await expect(casoDeUso.ejecutar('no-existe', 'admin-1')).rejects.toBeInstanceOf(
      ErrorUsuarioNoEncontrado,
    );
  });
});

describe('ObtenerFichaUsuario (FR-015 de la 009)', () => {
  it('reúne último ingreso, sesiones, bloqueo, historial de roles y últimos eventos', async () => {
    const usuarios = new RepositorioUsuariosEnMemoria();
    const consulta = new ConsultaPanelFalsa();
    const bloqueos = new BloqueosFalsos();
    const auditoria = new AuditoriaEnMemoria();
    await usuarios.crear(usuarioFicticio());
    consulta.sesionesPorUsuario.set('usuario-1', 2);
    const historial = [
      {
        rol: 'CAJA' as const,
        asignadoPor: { id: 'admin-1', nombre: 'Ana Admin' },
        asignadoEn: T0,
        retiradoPor: null,
        retiradoEn: null,
      },
    ];
    consulta.historiales.set('usuario-1', historial);
    const hasta = new Date(T0.getTime() + 300_000);
    bloqueos.bloqueadas.set('persona@ejemplo.pe', hasta);
    const ingreso = new Date('2026-11-16T15:00:00Z');
    await auditoria.registrar(
      eventoPropio({
        accion: 'INGRESO_CORRECTO',
        usuarioId: 'usuario-1',
        origenHmac: null,
        en: ingreso,
      }),
    );
    const casoDeUso = new ObtenerFichaUsuario({
      usuarios,
      consulta,
      bloqueos,
      auditoria,
      reloj: new RelojFalso(),
    });

    const ficha = await casoDeUso.ejecutar('usuario-1');

    expect(ficha.usuario.id).toBe('usuario-1');
    expect(ficha.ultimoIngreso).toEqual(ingreso);
    expect(ficha.sesionesAbiertas).toBe(2);
    expect(ficha.bloqueo).toEqual({ bloqueada: true, hasta });
    expect(ficha.historialRoles).toEqual(historial);
    expect(ficha.ultimosEventos.map((e) => e.accion)).toEqual(['INGRESO_CORRECTO']);
  });

  it('un usuario que no existe responde no encontrado', async () => {
    const casoDeUso = new ObtenerFichaUsuario({
      usuarios: new RepositorioUsuariosEnMemoria(),
      consulta: new ConsultaPanelFalsa(),
      bloqueos: new BloqueosFalsos(),
      auditoria: new AuditoriaEnMemoria(),
      reloj: new RelojFalso(),
    });

    await expect(casoDeUso.ejecutar('no-existe')).rejects.toBeInstanceOf(ErrorUsuarioNoEncontrado);
  });
});
