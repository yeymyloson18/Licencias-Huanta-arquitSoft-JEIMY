import type { AccionAuditoria } from '../../../../../src/modulos/seguridad/dominio/accion-auditoria';
import { ErrorDominio } from '../../../../../src/modulos/seguridad/dominio/error-dominio';
import {
  EventoAuditoria,
  eventoConfiguracion,
  eventoGestion,
  eventoIngreso,
  eventoPropio,
  type DetalleAuditoria,
} from '../../../../../src/modulos/seguridad/dominio/evento-auditoria';

const EN = new Date('2026-11-23T15:00:00Z');
const HMAC = 'a'.repeat(64);
const ADMIN = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';

const crear = (
  accion: AccionAuditoria,
  extra: Partial<Parameters<typeof EventoAuditoria.crear>[0]>,
) => EventoAuditoria.crear({ accion, ocurridoEn: EN, resultado: 'EXITO', ...extra });

describe('EventoAuditoria', () => {
  it('se crea con valores por defecto nulos y detalle vacío', () => {
    const evento = crear('CIERRE_SESION', {});

    expect(evento.actorUsuarioId).toBeNull();
    expect(evento.afectadoUsuarioId).toBeNull();
    expect(evento.objeto).toBeNull();
    expect(evento.origenHmac).toBeNull();
    expect(evento.eventoOrigenId).toBeNull();
    expect(evento.detalle).toEqual({});
  });

  it('rechaza una acción o un resultado fuera de la lista, o una fecha inválida', () => {
    expect(() => crear('INVENTADA' as AccionAuditoria, {})).toThrow(ErrorDominio);
    expect(() =>
      EventoAuditoria.crear({
        accion: 'CIERRE_SESION',
        ocurridoEn: EN,
        resultado: 'TAL_VEZ' as 'EXITO',
      }),
    ).toThrow('EXITO o RECHAZADO');
    expect(() =>
      EventoAuditoria.crear({
        accion: 'CIERRE_SESION',
        ocurridoEn: new Date('no'),
        resultado: 'EXITO',
      }),
    ).toThrow('fecha');
  });

  it('nunca acepta un correo donde va un identificador, ni lo repite en el error', () => {
    const correo = 'ana.perez@correo.pe';
    let mensaje = '';
    try {
      crear('INGRESO_CORRECTO', { actorUsuarioId: correo });
    } catch (error) {
      mensaje = (error as Error).message;
    }
    expect(mensaje).toContain('identificador interno');
    expect(mensaje).not.toContain(correo);
    expect(() => crear('INGRESO_CORRECTO', { afectadoUsuarioId: 'a b' })).toThrow(ErrorDominio);
  });

  it('el objeto solo puede ser un código de receta o una fecha', () => {
    expect(crear('RECETA_ACTUALIZADA', { objeto: 'LIC-01' }).objeto).toBe('LIC-01');
    expect(crear('FERIADO_REGISTRADO', { objeto: '2026-12-08' }).objeto).toBe('2026-12-08');
    expect(() => crear('RECETA_ACTUALIZADA', { objeto: 'ana@correo.pe' })).toThrow('objeto');
    expect(() => crear('RECETA_ACTUALIZADA', { objeto: 'Juan Pérez' })).toThrow('objeto');
  });

  it('el origen solo puede ser una huella HMAC de 64 hexadecimales', () => {
    expect(crear('INGRESO_CORRECTO', { origenHmac: HMAC }).origenHmac).toBe(HMAC);
    expect(() => crear('INGRESO_CORRECTO', { origenHmac: '192.168.0.10' })).toThrow('huella');
  });

  it('el evento de origen debe ser positivo', () => {
    expect(() => crear('FERIADO_ELIMINADO', { eventoOrigenId: 0n })).toThrow('positivo');
    expect(crear('FERIADO_ELIMINADO', { eventoOrigenId: 7n }).eventoOrigenId).toBe(7n);
  });

  describe('detalle permitido por acción', () => {
    const casos: [AccionAuditoria, DetalleAuditoria][] = [
      ['CLAVE_INCORRECTA', { motivo: 'CUENTA_INACTIVA' }],
      ['CODIGO_INCORRECTO', { motivo: 'DESAFIO_NO_VALIDO' }],
      ['CUENTA_BLOQUEADA', { segundos: 600 }],
      ['ORIGEN_BLOQUEADO', { segundos: 0 }],
      ['USUARIO_CREADO', { roles: ['CAJA', 'JEFATURA'] }],
      ['USUARIO_EDITADO', { campos: ['celular'] }],
      ['ROL_ASIGNADO', { rol: 'INSPECTOR' }],
      ['ROL_QUITADO', { rol: 'CAJA' }],
      ['SESIONES_CERRADAS', { sesiones: 2 }],
    ];

    it.each(casos)('%s acepta %j', (accion, detalle) => {
      expect(crear(accion, { detalle }).detalle).toEqual(detalle);
    });

    it('ignora claves sin valor', () => {
      expect(
        crear('ROL_ASIGNADO', { detalle: { rol: 'CAJA', motivo: undefined } }).detalle,
      ).toEqual({ rol: 'CAJA', motivo: undefined });
    });

    const invalidos: [AccionAuditoria, Record<string, unknown>][] = [
      ['INGRESO_CORRECTO', { motivo: 'CLAVE' }],
      ['CLAVE_INCORRECTA', { motivo: 'otro' }],
      ['CLAVE_INCORRECTA', { correo: 'ana@correo.pe' }],
      ['ROL_ASIGNADO', { rol: 'DIOS' }],
      ['USUARIO_CREADO', { roles: [] }],
      ['USUARIO_CREADO', { roles: ['CAJA', 'X'] }],
      ['USUARIO_EDITADO', { campos: ['correo'] }],
      ['USUARIO_EDITADO', { campos: [] }],
      ['SESIONES_CERRADAS', { sesiones: -1 }],
      ['CUENTA_BLOQUEADA', { segundos: 1.5 }],
      ['CUENTA_BLOQUEADA', { segundos: '10' }],
    ];

    it.each(invalidos)('%s rechaza %j', (accion, detalle) => {
      expect(() => crear(accion, { detalle: detalle as DetalleAuditoria })).toThrow(ErrorDominio);
    });
  });

  describe('fábricas', () => {
    it('intento de ingreso: rechazado, sin actor y con la cuenta afectada', () => {
      const evento = eventoIngreso({
        accion: 'CLAVE_INCORRECTA',
        afectadoUsuarioId: USUARIO,
        origenHmac: HMAC,
        en: EN,
        detalle: { motivo: 'CLAVE' },
      });
      expect(evento).toMatchObject({
        resultado: 'RECHAZADO',
        actorUsuarioId: null,
        afectadoUsuarioId: USUARIO,
        origenHmac: HMAC,
        detalle: { motivo: 'CLAVE' },
      });
      expect(
        eventoIngreso({
          accion: 'ORIGEN_BLOQUEADO',
          afectadoUsuarioId: null,
          origenHmac: null,
          en: EN,
        }).detalle,
      ).toEqual({});
    });

    it('acción propia: la persona es actor y afectada', () => {
      expect(
        eventoPropio({ accion: 'INGRESO_CORRECTO', usuarioId: USUARIO, origenHmac: null, en: EN }),
      ).toMatchObject({ resultado: 'EXITO', actorUsuarioId: USUARIO, afectadoUsuarioId: USUARIO });
    });

    it('gestión: el administrador actúa sobre el usuario', () => {
      expect(
        eventoGestion({
          accion: 'ROL_QUITADO',
          administradorId: ADMIN,
          usuarioId: USUARIO,
          en: EN,
          detalle: { rol: 'CAJA' },
        }),
      ).toMatchObject({
        actorUsuarioId: ADMIN,
        afectadoUsuarioId: USUARIO,
        detalle: { rol: 'CAJA' },
      });
      expect(
        eventoGestion({
          accion: 'CUENTA_DESBLOQUEADA',
          administradorId: ADMIN,
          usuarioId: USUARIO,
          en: EN,
        }).detalle,
      ).toEqual({});
    });

    it('configuración: con objeto y evento de origen, sin afectado', () => {
      expect(
        eventoConfiguracion({
          accion: 'FERIADO_REGISTRADO',
          usuarioId: ADMIN,
          objeto: '2026-12-08',
          en: EN,
          eventoOrigenId: 15n,
        }),
      ).toMatchObject({
        actorUsuarioId: ADMIN,
        afectadoUsuarioId: null,
        objeto: '2026-12-08',
        eventoOrigenId: 15n,
      });
    });
  });
});
