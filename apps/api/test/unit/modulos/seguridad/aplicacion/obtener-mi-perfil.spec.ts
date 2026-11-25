import { ErrorAutenticacion } from '../../../../../src/modulos/seguridad/aplicacion/errores';
import { ObtenerMiPerfil } from '../../../../../src/modulos/seguridad/aplicacion/obtener-mi-perfil';
import { eventoPropio } from '../../../../../src/modulos/seguridad/dominio/evento-auditoria';
import {
  AuditoriaEnMemoria,
  ConsultaPanelFalsa,
  RelojFalso,
  RepositorioUsuariosEnMemoria,
  T0,
  usuarioFicticio,
} from './dobles';

describe('ObtenerMiPerfil (011, FR-002 a FR-005)', () => {
  const preparar = async (opciones: Parameters<typeof usuarioFicticio>[0] = {}) => {
    const usuarios = new RepositorioUsuariosEnMemoria();
    const consulta = new ConsultaPanelFalsa();
    const auditoria = new AuditoriaEnMemoria();
    const reloj = new RelojFalso();
    await usuarios.crear(usuarioFicticio(opciones));
    await usuarios.crear(usuarioFicticio({ id: 'usuario-2', correo: 'otra@ejemplo.pe' }));
    const casoDeUso = new ObtenerMiPerfil({ usuarios, consulta, auditoria, reloj });
    return { consulta, auditoria, reloj, casoDeUso };
  };

  it('devuelve los datos propios, el último ingreso y las sesiones abiertas', async () => {
    const { consulta, auditoria, casoDeUso } = await preparar({ roles: ['MESA_PARTES', 'CAJA'] });
    consulta.sesionesPorUsuario.set('usuario-1', 2);
    consulta.sesionesPorUsuario.set('usuario-2', 7);
    const ingreso = new Date('2026-11-16T15:00:00Z');
    await auditoria.registrar(
      eventoPropio({
        accion: 'INGRESO_CORRECTO',
        usuarioId: 'usuario-1',
        origenHmac: null,
        en: ingreso,
      }),
    );
    await auditoria.registrar(
      eventoPropio({
        accion: 'INGRESO_CORRECTO',
        usuarioId: 'usuario-2',
        origenHmac: null,
        en: T0,
      }),
    );

    const perfil = await casoDeUso.ejecutar('usuario-1');

    expect(perfil.usuario.id).toBe('usuario-1');
    expect(perfil.usuario.correo.valor).toBe('persona@ejemplo.pe');
    expect(perfil.usuario.nombreCompleto.valor).toBe('Persona Ficticia');
    expect(perfil.usuario.celular.enmascarado()).toBe('9*****321');
    expect(perfil.usuario.rolesVigentes).toEqual(['MESA_PARTES', 'CAJA']);
    expect(perfil.ultimoIngreso).toEqual(ingreso);
    expect(perfil.sesionesAbiertas).toBe(2);
  });

  it('sin ingresos registrados, el último ingreso es null', async () => {
    const { casoDeUso } = await preparar();

    const perfil = await casoDeUso.ejecutar('usuario-1');

    expect(perfil.ultimoIngreso).toBeNull();
    expect(perfil.sesionesAbiertas).toBe(0);
  });

  it('cuenta las sesiones a la hora del reloj y solo con el id recibido', async () => {
    const { consulta, auditoria, reloj, casoDeUso } = await preparar();
    const sesiones = jest.spyOn(consulta, 'sesionesAbiertasDe');
    const ingresos = jest.spyOn(auditoria, 'ultimoIngreso');
    reloj.avanzar(120);

    await casoDeUso.ejecutar('usuario-1');

    expect(sesiones.mock.calls).toEqual([['usuario-1', new Date(T0.getTime() + 120_000)]]);
    expect(ingresos.mock.calls).toEqual([['usuario-1']]);
  });

  it('un usuario que no existe es "sin sesión", nunca "no encontrado"', async () => {
    const { casoDeUso } = await preparar();

    await expect(casoDeUso.ejecutar('no-existe')).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('un usuario desactivado también es "sin sesión"', async () => {
    const { casoDeUso } = await preparar({ activo: false });

    await expect(casoDeUso.ejecutar('usuario-1')).rejects.toBeInstanceOf(ErrorAutenticacion);
  });
});
