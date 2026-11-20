import { codigoEsquelaDe, Esquela } from '../../../../../src/modulos/pagos/dominio/esquela';
import {
  ErrorDatoPagos,
  ErrorEsquelaNoPagada,
  ErrorEsquelaYaPagada,
} from '../../../../../src/modulos/pagos/dominio/errores';
import { NumeroRecibo } from '../../../../../src/modulos/pagos/dominio/numero-recibo';

const T0 = new Date('2026-11-20T15:00:00.000Z');

const generar = (
  cambios: Partial<{ monto: string; numeroExpediente: string; concepto: string }> = {},
) =>
  Esquela.generar({
    numeroExpediente: 'EXP-2026-000001',
    codigoReceta: 'LIC-02',
    concepto: 'Licencia de funcionamiento – riesgo medio',
    monto: '177.1',
    en: T0,
    ...cambios,
  });

describe('Esquela (RF11, ADR-004)', () => {
  it('tiene el código ESQ-<expediente>, el monto con dos decimales y ningún pago', () => {
    const esquela = generar();

    expect(esquela.codigo).toBe('ESQ-EXP-2026-000001');
    expect(codigoEsquelaDe('EXP-2026-000001')).toBe('ESQ-EXP-2026-000001');
    expect(esquela.aDatos()).toMatchObject({ monto: '177.10', pago: null, generadaEn: T0 });
    expect(esquela.pagada).toBe(false);
    expect(esquela.numeroExpediente).toBe('EXP-2026-000001');
  });

  it.each(['0', '0.00', '-5', 'abc'])('el monto %s no es válido', (monto) => {
    expect(() => generar({ monto })).toThrow(ErrorDatoPagos);
  });

  it('un número de expediente inválido o sin concepto no es válido', () => {
    expect(() => generar({ numeroExpediente: 'EXP-1' })).toThrow(ErrorDatoPagos);
    expect(() => generar({ concepto: ' ' })).toThrow(ErrorDatoPagos);
  });

  it('se paga una sola vez', () => {
    const pagada = generar().registrarPago(NumeroRecibo.crear('rec-0001'), 'cajero-1', T0);

    expect(pagada.pagada).toBe(true);
    expect(pagada.aDatos().pago).toEqual({
      numeroRecibo: 'REC-0001',
      pagadaEn: T0,
      registradoPor: 'cajero-1',
    });
    expect(() => pagada.registrarPago(NumeroRecibo.crear('REC-0002'), 'cajero-2', T0)).toThrow(
      ErrorEsquelaYaPagada,
    );
  });

  it('el recibo se corrige solo si está pagada, con motivo y si cambia', () => {
    const pendiente = generar();
    expect(() =>
      pendiente.corregirRecibo(NumeroRecibo.crear('REC-0002'), 'Error al digitar el recibo'),
    ).toThrow(ErrorEsquelaNoPagada);

    const pagada = pendiente.registrarPago(NumeroRecibo.crear('REC-0001'), 'cajero-1', T0);
    expect(() => pagada.corregirRecibo(NumeroRecibo.crear('REC-0002'), 'corto')).toThrow(
      ErrorDatoPagos,
    );
    expect(() =>
      pagada.corregirRecibo(NumeroRecibo.crear('REC-0001'), 'Error al digitar el recibo'),
    ).toThrow(ErrorDatoPagos);

    const correccion = pagada.corregirRecibo(
      NumeroRecibo.crear('REC-0002'),
      '  Error al digitar el recibo  ',
    );
    expect(correccion.reciboAnterior).toBe('REC-0001');
    expect(correccion.motivo).toBe('Error al digitar el recibo');
    expect(correccion.esquela.aDatos().pago?.numeroRecibo).toBe('REC-0002');
  });

  it('se reconstruye tal como estaba guardada', () => {
    const datos = generar().aDatos();

    expect(Esquela.reconstruir(datos).aDatos()).toEqual(datos);
  });
});

describe('NumeroRecibo (FR-023)', () => {
  it('normaliza mayúsculas y espacios', () => {
    expect(NumeroRecibo.crear(' rec - 000123 ').valor).toBe('REC-000123');
  });

  it.each(['ABC', 'X'.repeat(31), 'REC_0001', 'REC/0001'])('rechaza %s', (texto) => {
    expect(() => NumeroRecibo.crear(texto)).toThrow(ErrorDatoPagos);
  });
});
