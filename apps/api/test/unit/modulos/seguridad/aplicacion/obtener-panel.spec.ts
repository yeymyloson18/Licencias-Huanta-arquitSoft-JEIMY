import { ObtenerPanel } from '../../../../../src/modulos/seguridad/aplicacion/obtener-panel';
import {
  eventoGestion,
  eventoIngreso,
} from '../../../../../src/modulos/seguridad/dominio/evento-auditoria';
import {
  armarPanel,
  limitesIngresosFallidos,
} from '../../../../../src/modulos/seguridad/dominio/panel-administrador';
import { AuditoriaEnMemoria, BloqueosFalsos, ConsultaPanelFalsa, RelojFalso, T0 } from './dobles';

const fallo = (iso: string) =>
  eventoIngreso({
    accion: 'CLAVE_INCORRECTA',
    afectadoUsuarioId: null,
    origenHmac: null,
    en: new Date(iso),
  });

describe('Panel del administrador: dominio (009)', () => {
  it('"hoy" empieza a las 00:00 de Lima y "7 días" incluye hoy y los 6 anteriores', () => {
    // 2026-11-17T03:00Z en Lima todavía es el 16 de noviembre.
    expect(limitesIngresosFallidos(new Date('2026-11-17T03:00:00Z'))).toEqual({
      hoy: new Date('2026-11-16T05:00:00Z'),
      ultimos7Dias: new Date('2026-11-10T05:00:00Z'),
    });
  });

  it('los 6 roles siempre aparecen, con 0 si no tienen usuarios, y como mucho 10 eventos', () => {
    const panel = armarPanel({
      cifras: { activos: 1, inactivos: 0, porRol: { JEFATURA: 1 }, sesionesAbiertas: 0 },
      bloqueos: null,
      fallidosHoy: 0,
      fallidos7Dias: 0,
      ultimosEventos: Array.from({ length: 12 }, (_, i) => ({
        id: String(i),
        ocurridoEn: T0,
        accion: 'CIERRE_SESION' as const,
        actor: null,
        afectado: null,
        objeto: null,
        resultado: 'EXITO' as const,
      })),
    });

    expect(panel.porRol).toEqual({
      MESA_PARTES: 0,
      EVALUADOR: 0,
      INSPECTOR: 0,
      CAJA: 0,
      JEFATURA: 1,
      ADMINISTRADOR: 0,
    });
    expect(panel.ultimosEventos).toHaveLength(10);
    expect(panel.bloqueos).toBeNull();
  });
});

describe('ObtenerPanel (HU1 de la 009)', () => {
  const preparar = async () => {
    const consulta = new ConsultaPanelFalsa();
    const bloqueos = new BloqueosFalsos();
    const auditoria = new AuditoriaEnMemoria();
    // RelojFalso: 2026-11-17T10:00Z (en Lima, 17 de noviembre a las 05:00).
    await auditoria.registrar(fallo('2026-11-17T06:00:00Z')); // hoy en Lima
    await auditoria.registrar(fallo('2026-11-14T15:00:00Z')); // hace 3 días
    await auditoria.registrar(fallo('2026-11-01T15:00:00Z')); // fuera de los 7 días
    await auditoria.registrar(
      eventoGestion({
        accion: 'USUARIO_CREADO',
        administradorId: 'admin-1',
        usuarioId: 'u-1',
        en: new Date('2026-11-17T07:00:00Z'),
        detalle: { roles: ['CAJA'] },
      }),
    );
    const casoDeUso = new ObtenerPanel({ consulta, bloqueos, auditoria, reloj: new RelojFalso() });
    return { consulta, bloqueos, casoDeUso };
  };

  it('reúne usuarios, roles, sesiones, ingresos fallidos y los últimos eventos', async () => {
    const { casoDeUso } = await preparar();

    const panel = await casoDeUso.ejecutar();

    expect(panel.usuarios).toEqual({ activos: 5, inactivos: 2 });
    expect(panel.porRol.CAJA).toBe(2);
    expect(panel.porRol.EVALUADOR).toBe(0);
    expect(panel.sesionesAbiertas).toBe(3);
    expect(panel.ingresosFallidos).toEqual({ hoy: 1, ultimos7Dias: 2 });
    expect(panel.ultimosEventos.map((e) => e.accion)).toEqual([
      'USUARIO_CREADO',
      'CLAVE_INCORRECTA',
      'CLAVE_INCORRECTA',
      'CLAVE_INCORRECTA',
    ]);
  });

  it('cuenta como cuentas bloqueadas solo los correos que existen, y los orígenes aparte', async () => {
    const { consulta, bloqueos, casoDeUso } = await preparar();
    bloqueos.bloqueadas.set('hmac-existe', T0);
    bloqueos.bloqueadas.set('hmac-inventado', T0);
    bloqueos.origenes = 2;
    consulta.cuentasExistentes.add('hmac-existe');

    expect((await casoDeUso.ejecutar()).bloqueos).toEqual({ cuentas: 1, origenes: 2 });
  });

  it('si el servicio de bloqueos no responde, esa cifra es null y lo demás se muestra (FR-004)', async () => {
    const { bloqueos, casoDeUso } = await preparar();
    bloqueos.noDisponible = true;

    const panel = await casoDeUso.ejecutar();

    expect(panel.bloqueos).toBeNull();
    expect(panel.usuarios.activos).toBe(5);
  });
});
