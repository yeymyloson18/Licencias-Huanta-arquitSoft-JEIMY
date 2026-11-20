import {
  DescargarPdfEsquela,
  ErrorEsquelaDeOtroExpediente,
  ErrorEsquelaEnGeneracion,
} from '../../../../../src/modulos/pagos/aplicacion/descargar-pdf-esquela';
import { ErrorEsquelaNoEncontrada } from '../../../../../src/modulos/pagos/aplicacion/errores';
import { type DatosEsquela, Esquela } from '../../../../../src/modulos/pagos/dominio/esquela';
import { PdfEsquelaPdfLib } from '../../../../../src/modulos/pagos/infraestructura/pdf-esquela-pdflib';
import { textoDePdf } from '../../../../apoyo/texto-pdf';

const T0 = new Date('2026-11-20T15:00:00.000Z');
const ESQUELA = Esquela.generar({
  numeroExpediente: 'EXP-2026-000001',
  codigoReceta: 'LIC-02',
  concepto: 'Licencia de funcionamiento – riesgo medio',
  monto: '177.10',
  en: T0,
});

describe('DescargarPdfEsquela (FR-016 a FR-018 de la 005)', () => {
  let estado: string | null;
  const generados: DatosEsquela[] = [];
  const pdfFalso = {
    generar: (datos: DatosEsquela) => {
      generados.push(datos);
      return Promise.resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    },
  };
  const esquelas = {
    obtener: (codigo: string) => Promise.resolve(codigo === ESQUELA.codigo ? ESQUELA : null),
  };
  const descargar = (
    codigo: string,
    lector: Parameters<DescargarPdfEsquela['ejecutar']>[0]['lector'],
  ) =>
    new DescargarPdfEsquela({
      esquelas,
      expedientes: { estadoDe: () => Promise.resolve(estado) },
      pdf: pdfFalso,
    }).ejecutar({ codigo, lector });

  beforeEach(() => {
    estado = 'PENDIENTE_PAGO';
    generados.length = 0;
  });

  it('con el tokenConsulta del mismo expediente entrega el PDF', async () => {
    const resultado = await descargar('ESQ-EXP-2026-000001', {
      tipo: 'CONSULTA',
      numeroExpediente: 'EXP-2026-000001',
    });

    expect(resultado.codigo).toBe('ESQ-EXP-2026-000001');
    expect(generados[0]).toMatchObject({ codigo: 'ESQ-EXP-2026-000001', monto: '177.10' });
  });

  it('con el token de otro expediente se rechaza', async () => {
    await expect(
      descargar('ESQ-EXP-2026-000001', { tipo: 'CONSULTA', numeroExpediente: 'EXP-2026-000002' }),
    ).rejects.toBeInstanceOf(ErrorEsquelaDeOtroExpediente);
  });

  it('si la esquela aún no existe y el expediente espera el pago, está en generación', async () => {
    await expect(descargar('ESQ-EXP-2026-000009', { tipo: 'PERSONAL' })).rejects.toBeInstanceOf(
      ErrorEsquelaEnGeneracion,
    );
  });

  it('si no existe y el expediente no espera el pago, no se encuentra', async () => {
    estado = 'REGISTRADO';

    await expect(descargar('ESQ-EXP-2026-000009', { tipo: 'PERSONAL' })).rejects.toBeInstanceOf(
      ErrorEsquelaNoEncontrada,
    );
  });
});

describe('PdfEsquelaPdfLib (research §R-07 de la 005)', () => {
  it('genera un PDF con el código, el expediente, el concepto, el monto y cómo pagar', async () => {
    const pdf = await new PdfEsquelaPdfLib().generar(ESQUELA.aDatos());
    const texto = textoDePdf(pdf);

    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe('%PDF');
    // pdf-lib escribe el texto como cadenas hexadecimales: se buscan así.
    const enHex = (t: string) => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
    for (const fragmento of [
      'ESQ-EXP-2026-000001',
      'EXP-2026-000001',
      'S/ 177.10',
      'Esquela de pago',
    ]) {
      expect(texto.toUpperCase()).toContain(enHex(fragmento));
    }
  });
});
