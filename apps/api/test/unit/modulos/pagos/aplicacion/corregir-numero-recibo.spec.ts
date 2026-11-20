import {
  CorregirNumeroRecibo,
  ErrorReciboCambiado,
} from '../../../../../src/modulos/pagos/aplicacion/corregir-numero-recibo';
import {
  ErrorEsquelaNoEncontrada,
  ErrorReciboRepetido,
} from '../../../../../src/modulos/pagos/aplicacion/errores';
import { Esquela } from '../../../../../src/modulos/pagos/dominio/esquela';
import {
  ErrorDatoPagos,
  ErrorEsquelaNoPagada,
} from '../../../../../src/modulos/pagos/dominio/errores';
import { NumeroRecibo } from '../../../../../src/modulos/pagos/dominio/numero-recibo';
import type {
  CorreccionRecibo,
  ResultadoCorreccion,
} from '../../../../../src/modulos/pagos/dominio/puertos/repositorio-esquelas';

const T0 = new Date('2026-11-20T15:00:00.000Z');
const T1 = new Date('2026-11-21T15:00:00.000Z');
const JEFATURA = '00000000-0000-4000-8000-0000000000c1';
const MOTIVO = 'El cajero digitó mal el número';

const pendiente = Esquela.generar({
  numeroExpediente: 'EXP-2026-000001',
  codigoReceta: 'LIC-02',
  concepto: 'Licencia de funcionamiento – riesgo medio',
  monto: '177.10',
  en: T0,
});
const pagada = pendiente.registrarPago(NumeroRecibo.crear('REC-0001'), 'cajero-1', T0);

describe('CorregirNumeroRecibo (RF24, historia 6 de la 005)', () => {
  let actual: Esquela | null;
  let resultado: ResultadoCorreccion;
  const correcciones: CorreccionRecibo[] = [];

  const corregir = (numeroRecibo = 'rec-0002', motivo = MOTIVO) =>
    new CorregirNumeroRecibo({
      esquelas: {
        obtener: () => Promise.resolve(actual),
        corregirRecibo: (correccion) => {
          correcciones.push(correccion);
          return Promise.resolve(resultado);
        },
      },
      expedientes: { estadoDe: () => Promise.resolve('PAGADO') },
      reloj: { ahora: () => T1 },
    }).ejecutar({ codigo: ' esq-exp-2026-000001 ', numeroRecibo, motivo, usuarioId: JEFATURA });

  beforeEach(() => {
    actual = pagada;
    resultado = 'CORREGIDO';
    correcciones.length = 0;
  });

  it('corrige el recibo con el anterior, el motivo y quién lo hizo', async () => {
    const esquela = await corregir();

    expect(esquela).toMatchObject({
      codigo: 'ESQ-EXP-2026-000001',
      pago: { numeroRecibo: 'REC-0002', registradoPor: 'cajero-1' },
      estadoExpediente: 'PAGADO',
    });
    expect(correcciones).toHaveLength(1);
    expect(correcciones[0]).toMatchObject({
      reciboAnterior: 'REC-0001',
      motivo: MOTIVO,
      usuarioId: JEFATURA,
      en: T1,
    });
  });

  it('sin motivo suficiente o con el mismo recibo es un dato inválido', async () => {
    await expect(corregir('REC-0002', 'corto')).rejects.toBeInstanceOf(ErrorDatoPagos);
    await expect(corregir('REC-0001')).rejects.toBeInstanceOf(ErrorDatoPagos);
    await expect(corregir('A1')).rejects.toBeInstanceOf(ErrorDatoPagos);
    expect(correcciones).toEqual([]);
  });

  it('una esquela no pagada no se corrige', async () => {
    actual = pendiente;

    await expect(corregir()).rejects.toBeInstanceOf(ErrorEsquelaNoPagada);
  });

  it('una esquela inexistente no se encuentra', async () => {
    actual = null;

    await expect(corregir()).rejects.toBeInstanceOf(ErrorEsquelaNoEncontrada);
  });

  it('un recibo que ya está en otra esquela es repetido', async () => {
    resultado = 'RECIBO_REPETIDO';

    await expect(corregir()).rejects.toBeInstanceOf(ErrorReciboRepetido);
  });

  it('si otra corrección ganó la carrera, avisa que cambió', async () => {
    resultado = 'CAMBIO';

    await expect(corregir()).rejects.toBeInstanceOf(ErrorReciboCambiado);
  });
});
