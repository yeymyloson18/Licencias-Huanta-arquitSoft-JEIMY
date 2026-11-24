import { RegistrarEventoConfiguracion } from '../../../../../src/modulos/seguridad/aplicacion/registrar-evento-configuracion';
import {
  ErrorEventoInvalidoSeguridad,
  EVENTOS_CONFIGURACION,
  manejadorConfiguracion,
} from '../../../../../src/modulos/seguridad/infraestructura/manejadores-configuracion';
import { AuditoriaEnMemoria } from './dobles';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const EN = '2026-11-23T15:00:00.000Z';

describe('RegistrarEventoConfiguracion (009, research §R-02)', () => {
  it('registra la acción con quién, el objeto, la hora del cambio y el evento de origen', async () => {
    const auditoria = new AuditoriaEnMemoria();
    const registrar = new RegistrarEventoConfiguracion(auditoria);

    await expect(
      registrar.ejecutar({
        accion: 'RECETA_ACTUALIZADA',
        usuarioId: ADMIN,
        objeto: 'LIC-01',
        en: new Date(EN),
        eventoId: 41n,
      }),
    ).resolves.toBe(true);

    expect(auditoria.eventos[0]).toMatchObject({
      accion: 'RECETA_ACTUALIZADA',
      actorUsuarioId: ADMIN,
      afectadoUsuarioId: null,
      objeto: 'LIC-01',
      resultado: 'EXITO',
      ocurridoEn: new Date(EN),
      eventoOrigenId: 41n,
    });
  });

  it('el mismo evento entregado dos veces queda una sola vez', async () => {
    const auditoria = new AuditoriaEnMemoria();
    const registrar = new RegistrarEventoConfiguracion(auditoria);
    const entrada = {
      accion: 'FERIADO_ELIMINADO' as const,
      usuarioId: ADMIN,
      objeto: '2026-12-08',
      en: new Date(EN),
      eventoId: 7n,
    };

    await registrar.ejecutar(entrada);
    await expect(registrar.ejecutar(entrada)).resolves.toBe(false);

    expect(auditoria.eventos).toHaveLength(1);
  });
});

describe('Manejadores de los eventos de configuración', () => {
  it('cubren los 5 tipos de catálogo y feriados', () => {
    expect(EVENTOS_CONFIGURACION.map((e) => e.tipo)).toEqual([
      'RecetaActualizada',
      'RecetaDesactivada',
      'RecetaReactivada',
      'FeriadoRegistrado',
      'FeriadoEliminado',
    ]);
  });

  it('una receta usa su código como objeto; un feriado, su fecha', async () => {
    const auditoria = new AuditoriaEnMemoria();
    const registrar = new RegistrarEventoConfiguracion(auditoria);

    await manejadorConfiguracion(
      registrar,
      'RecetaDesactivada',
      'RECETA_DESACTIVADA',
    )({ codigoReceta: 'LIC-02', usuarioId: ADMIN, en: EN }, { id: 1n });
    await manejadorConfiguracion(
      registrar,
      'FeriadoRegistrado',
      'FERIADO_REGISTRADO',
    )({ fecha: '2026-12-08', usuarioId: ADMIN, en: EN }, { id: 2n });

    expect(auditoria.eventos.map((e) => [e.accion, e.objeto, e.eventoOrigenId])).toEqual([
      ['RECETA_DESACTIVADA', 'LIC-02', 1n],
      ['FERIADO_REGISTRADO', '2026-12-08', 2n],
    ]);
  });

  it.each([
    ['RecetaActualizada', { codigoReceta: 'lic 01', usuarioId: ADMIN, en: EN }],
    ['RecetaActualizada', { codigoReceta: 'LIC-01', usuarioId: 'ana@correo.pe', en: EN }],
    ['FeriadoEliminado', { fecha: '08/12/2026', usuarioId: ADMIN, en: EN }],
    ['FeriadoEliminado', null],
  ])(
    'un %s mal formado lanza un error con nombre propio y no registra nada',
    async (tipo, datos) => {
      const auditoria = new AuditoriaEnMemoria();
      const manejador = manejadorConfiguracion(
        new RegistrarEventoConfiguracion(auditoria),
        tipo,
        'RECETA_ACTUALIZADA',
      );

      await expect(manejador(datos, { id: 3n })).rejects.toBeInstanceOf(
        ErrorEventoInvalidoSeguridad,
      );
      expect(auditoria.eventos).toEqual([]);
    },
  );
});
