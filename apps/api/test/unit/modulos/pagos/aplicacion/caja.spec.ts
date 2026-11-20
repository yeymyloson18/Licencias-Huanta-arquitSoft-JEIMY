import {
  ConsultarEsquela,
  RegistrarPagoEnCaja,
} from '../../../../../src/modulos/pagos/aplicacion/caja';
import {
  ErrorEsquelaNoEncontrada,
  ErrorExpedienteNoPendiente,
  ErrorReciboRepetido,
} from '../../../../../src/modulos/pagos/aplicacion/errores';
import { Esquela } from '../../../../../src/modulos/pagos/dominio/esquela';
import {
  ErrorDatoPagos,
  ErrorEsquelaYaPagada,
} from '../../../../../src/modulos/pagos/dominio/errores';
import type {
  RepositorioEsquelas,
  ResultadoRegistroPago,
} from '../../../../../src/modulos/pagos/dominio/puertos/repositorio-esquelas';

const T0 = new Date('2026-11-20T15:00:00.000Z');

/** Repositorio en memoria con las reglas de la base: pago único y recibo único. */
class EsquelasEnMemoria implements Pick<RepositorioEsquelas, 'obtener' | 'registrarPago'> {
  readonly esquelas = new Map<string, Esquela>();
  /** Simula que otro cajero pagó entre la lectura y el guardado. */
  carrera = false;

  crearSiNoExiste(esquela: Esquela) {
    this.esquelas.set(esquela.codigo, esquela);
    return Promise.resolve(true);
  }

  obtener(codigo: string) {
    return Promise.resolve(this.esquelas.get(codigo) ?? null);
  }

  registrarPago(pagada: Esquela): Promise<ResultadoRegistroPago> {
    const actual = this.esquelas.get(pagada.codigo);
    if (this.carrera || actual?.pagada) {
      return Promise.resolve('YA_PAGADA');
    }
    const recibo = pagada.aDatos().pago?.numeroRecibo;
    const repetido = [...this.esquelas.values()].some(
      (e) => e.aDatos().pago?.numeroRecibo === recibo,
    );
    if (repetido) {
      return Promise.resolve('RECIBO_REPETIDO');
    }
    this.esquelas.set(pagada.codigo, pagada);
    return Promise.resolve('REGISTRADO');
  }
}

describe('Caja (CU16 de la 005)', () => {
  let esquelas: EsquelasEnMemoria;
  let estado: string | null;

  const expedientes = { estadoDe: () => Promise.resolve(estado) };

  const esquelaDe = (numero: string) =>
    Esquela.generar({
      numeroExpediente: numero,
      codigoReceta: 'LIC-02',
      concepto: 'Licencia de funcionamiento – riesgo medio',
      monto: '177.10',
      en: T0,
    });

  beforeEach(async () => {
    esquelas = new EsquelasEnMemoria();
    estado = 'PENDIENTE_PAGO';
    await esquelas.crearSiNoExiste(esquelaDe('EXP-2026-000001'));
    await esquelas.crearSiNoExiste(esquelaDe('EXP-2026-000002'));
  });

  const registrar = (numeroRecibo = ' rec-0001 ', codigo = 'esq-exp-2026-000001') =>
    new RegistrarPagoEnCaja({ esquelas, expedientes, reloj: { ahora: () => T0 } }).ejecutar({
      codigo,
      numeroRecibo,
      cajero: 'cajero-1',
    });

  it('consulta la esquela (código en minúsculas) con el estado del expediente', async () => {
    const esquela = await new ConsultarEsquela({ esquelas, expedientes }).ejecutar(
      ' esq-exp-2026-000001 ',
    );

    expect(esquela).toMatchObject({
      codigo: 'ESQ-EXP-2026-000001',
      monto: '177.10',
      pago: null,
      estadoExpediente: 'PENDIENTE_PAGO',
    });
  });

  it('una esquela que no existe no se encuentra', async () => {
    await expect(
      new ConsultarEsquela({ esquelas, expedientes }).ejecutar('ESQ-EXP-2026-999999'),
    ).rejects.toBeInstanceOf(ErrorEsquelaNoEncontrada);
    await expect(registrar('REC-0001', 'ESQ-EXP-2026-999999')).rejects.toBeInstanceOf(
      ErrorEsquelaNoEncontrada,
    );
  });

  it('registra el pago con el recibo normalizado, la hora y el cajero', async () => {
    const pagada = await registrar();

    expect(pagada.pago).toEqual({
      numeroRecibo: 'REC-0001',
      pagadaEn: T0,
      registradoPor: 'cajero-1',
    });
  });

  it('una esquela ya pagada no se vuelve a pagar', async () => {
    await registrar();

    await expect(registrar('REC-0002')).rejects.toBeInstanceOf(ErrorEsquelaYaPagada);
  });

  it('si otro cajero pagó justo antes, responde ya pagada', async () => {
    esquelas.carrera = true;

    await expect(registrar()).rejects.toBeInstanceOf(ErrorEsquelaYaPagada);
  });

  it('un recibo repetido en otra esquela se rechaza', async () => {
    await registrar('REC-0001');

    await expect(registrar('REC-0001', 'ESQ-EXP-2026-000002')).rejects.toBeInstanceOf(
      ErrorReciboRepetido,
    );
  });

  it('un recibo con formato inválido se rechaza antes de buscar', async () => {
    await expect(registrar('A1')).rejects.toBeInstanceOf(ErrorDatoPagos);
  });

  it.each(['DENEGADO', 'PAGADO', null])('con el expediente %s no se registra', async (otro) => {
    estado = otro;

    await expect(registrar()).rejects.toBeInstanceOf(ErrorExpedienteNoPendiente);
  });
});
