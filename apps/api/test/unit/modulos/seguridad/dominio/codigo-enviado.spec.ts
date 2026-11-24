import {
  desenlaceDelCodigo,
  textoDesenlace,
  VIGENCIA_CODIGO_MS,
} from '../../../../../src/modulos/seguridad/dominio/desenlace-codigo';
import { ErrorDominio } from '../../../../../src/modulos/seguridad/dominio/error-dominio';
import {
  EventoAuditoria,
  eventoCodigoEnviado,
  eventoIngreso,
  eventoLimiteCodigos,
  eventoPropio,
  OBJETO_IDENTIDAD_ADMINISTRADO,
} from '../../../../../src/modulos/seguridad/dominio/evento-auditoria';

const EN = new Date('2026-11-24T15:00:00Z');
const USUARIO = '22222222-2222-4222-8222-222222222222';
const INTENTO = '33333333-3333-4333-8333-333333333333';

describe('Código enviado (010)', () => {
  it('ingreso del personal: sobre la cuenta, sin actor, con el intento y el detalle sin el código', () => {
    const evento = eventoCodigoEnviado({
      proposito: 'INGRESO_PERSONAL',
      canal: 'BUZON',
      destino: '9*****321',
      entrega: 'ENTREGADO',
      usuarioId: USUARIO,
      intentoId: INTENTO,
      origenHmac: null,
      en: EN,
    });

    expect(evento).toMatchObject({
      accion: 'CODIGO_ENVIADO',
      resultado: 'EXITO',
      actorUsuarioId: null,
      afectadoUsuarioId: USUARIO,
      objeto: null,
      intentoId: INTENTO,
      detalle: {
        proposito: 'INGRESO_PERSONAL',
        canal: 'BUZON',
        destino: '9*****321',
        entrega: 'ENTREGADO',
      },
    });
  });

  it('identidad del administrado: sin cuenta, con su objeto; un envío fallido es RECHAZADO', () => {
    const evento = eventoCodigoEnviado({
      proposito: 'IDENTIDAD_ADMINISTRADO',
      canal: 'SIMULADO',
      destino: '9*****555',
      entrega: 'FALLIDO',
      usuarioId: null,
      intentoId: null,
      origenHmac: null,
      en: EN,
    });

    expect(evento).toMatchObject({
      resultado: 'RECHAZADO',
      afectadoUsuarioId: null,
      objeto: OBJETO_IDENTIDAD_ADMINISTRADO,
    });
  });

  it('acepta correos enmascarados y rechaza un destino completo o un código en el detalle', () => {
    const base = {
      proposito: 'INGRESO_PERSONAL' as const,
      canal: 'CORREO' as const,
      entrega: 'ENTREGADO' as const,
      usuarioId: USUARIO,
      intentoId: INTENTO,
      origenHmac: null,
      en: EN,
    };
    expect(eventoCodigoEnviado({ ...base, destino: 'ju***@correo.pe' }).detalle.destino).toBe(
      'ju***@correo.pe',
    );
    expect(() => eventoCodigoEnviado({ ...base, destino: '987654321' })).toThrow(ErrorDominio);
    expect(() => eventoCodigoEnviado({ ...base, destino: 'juana@correo.pe' })).toThrow(
      ErrorDominio,
    );
    expect(() =>
      EventoAuditoria.crear({
        accion: 'CODIGO_ENVIADO',
        ocurridoEn: EN,
        resultado: 'EXITO',
        detalle: { codigo: '123456' } as never,
      }),
    ).toThrow('no admite el detalle codigo');
    expect(() =>
      EventoAuditoria.crear({
        accion: 'CODIGO_ENVIADO',
        ocurridoEn: EN,
        resultado: 'EXITO',
        detalle: { canal: 'PALOMA' as never },
      }),
    ).toThrow(ErrorDominio);
  });

  it('el intento solo lo llevan el código enviado y los eventos del paso 2', () => {
    expect(
      eventoPropio({
        accion: 'INGRESO_CORRECTO',
        usuarioId: USUARIO,
        origenHmac: null,
        en: EN,
        intentoId: INTENTO,
      }).intentoId,
    ).toBe(INTENTO);
    expect(
      eventoIngreso({
        accion: 'CODIGO_INCORRECTO',
        afectadoUsuarioId: USUARIO,
        origenHmac: null,
        en: EN,
        intentoId: INTENTO,
      }).intentoId,
    ).toBe(INTENTO);
    expect(() =>
      eventoPropio({
        accion: 'CIERRE_SESION',
        usuarioId: USUARIO,
        origenHmac: null,
        en: EN,
        intentoId: INTENTO,
      }),
    ).toThrow('no lleva intento');
    expect(() =>
      eventoIngreso({
        accion: 'CODIGO_INCORRECTO',
        afectadoUsuarioId: null,
        origenHmac: null,
        en: EN,
        intentoId: 'a@b',
      }),
    ).toThrow('identificador interno');
  });

  it('límite de códigos: rechazado, con propósito y segundos', () => {
    expect(
      eventoLimiteCodigos({
        proposito: 'INGRESO_PERSONAL',
        usuarioId: USUARIO,
        segundos: 600,
        origenHmac: null,
        en: EN,
      }),
    ).toMatchObject({
      accion: 'CODIGO_LIMITE_ALCANZADO',
      resultado: 'RECHAZADO',
      afectadoUsuarioId: USUARIO,
      objeto: null,
      detalle: { proposito: 'INGRESO_PERSONAL', segundos: 600 },
    });
    expect(
      eventoLimiteCodigos({
        proposito: 'IDENTIDAD_ADMINISTRADO',
        usuarioId: null,
        segundos: 1,
        origenHmac: null,
        en: EN,
      }).objeto,
    ).toBe(OBJETO_IDENTIDAD_ADMINISTRADO);
  });
});

describe('Desenlace del código (research §R-03 de la 010)', () => {
  type Posteriores = Parameters<typeof desenlaceDelCodigo>[0]['posteriores'];
  const desenlace = (
    posteriores: Posteriores,
    ms = 0,
    entrega: 'ENTREGADO' | 'FALLIDO' = 'ENTREGADO',
  ) =>
    desenlaceDelCodigo({
      entrega,
      posteriores,
      enviadoEn: EN,
      ahora: new Date(EN.getTime() + ms),
    });

  it('gana el resultado más fuerte', () => {
    expect(desenlace(['CODIGO_INCORRECTO', 'INGRESO_CORRECTO'])).toBe('INGRESO_CORRECTO');
    expect(desenlace(['CODIGO_INCORRECTO', 'CUENTA_BLOQUEADA'])).toBe('BLOQUEO');
    expect(desenlace(['ORIGEN_BLOQUEADO'])).toBe('BLOQUEO');
    expect(desenlace(['CODIGO_INCORRECTO'])).toBe('CODIGO_INCORRECTO');
  });

  it('sin eventos: pendiente mientras vale y sin usar cuando vence; fallido si no se entregó', () => {
    expect(desenlace([], VIGENCIA_CODIGO_MS - 1)).toBe('PENDIENTE');
    expect(desenlace([], VIGENCIA_CODIGO_MS)).toBe('SIN_USAR');
    expect(desenlace(['INGRESO_CORRECTO'], 0, 'FALLIDO')).toBe('ENVIO_FALLIDO');
  });

  it('cada desenlace tiene su texto', () => {
    expect(textoDesenlace('SIN_USAR')).toBe('Sin usar');
    expect(textoDesenlace('ENVIO_FALLIDO')).toBe('Envío fallido');
    expect(textoDesenlace('INGRESO_CORRECTO')).toBe('Ingreso correcto');
  });
});
