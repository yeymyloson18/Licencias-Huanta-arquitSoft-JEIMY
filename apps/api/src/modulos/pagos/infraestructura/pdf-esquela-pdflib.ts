import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { DatosEsquela } from '../dominio/esquela';
import type { PdfEsquela } from '../dominio/puertos/pdf-esquela';

const ANCHO = 595; // A4 en puntos
const ALTO = 842;
const MARGEN = 56;

const fechaLima = (fecha: Date): string =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' }).format(fecha);

/** Parte un texto en líneas que caben en `ancho` puntos. */
const partir = (texto: string, medir: (linea: string) => number, ancho: number): string[] => {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/)) {
    const candidata = actual === '' ? palabra : `${actual} ${palabra}`;
    if (medir(candidata) > ancho && actual !== '') {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  if (actual !== '') {
    lineas.push(actual);
  }
  return lineas;
};

/**
 * Esquela en PDF con `pdf-lib` y la fuente estándar Helvetica (research §R-07 de la 005): título,
 * número de expediente, concepto, monto, código, fecha e instrucciones para pagar en caja.
 */
export class PdfEsquelaPdfLib implements PdfEsquela {
  async generar(esquela: DatosEsquela): Promise<Uint8Array> {
    const documento = await PDFDocument.create();
    documento.setTitle(`Esquela de pago ${esquela.codigo}`);
    documento.setCreator('Municipalidad Provincial de Huanta');
    documento.setProducer('Sistema de Licencias de Funcionamiento');
    const pagina = documento.addPage([ANCHO, ALTO]);
    const normal = await documento.embedFont(StandardFonts.Helvetica);
    const negrita = await documento.embedFont(StandardFonts.HelveticaBold);
    const anchoUtil = ANCHO - 2 * MARGEN;
    let y = ALTO - MARGEN;

    const escribir = (texto: string, opciones: { tamano?: number; negrita?: boolean } = {}) => {
      const fuente = opciones.negrita === true ? negrita : normal;
      const tamano = opciones.tamano ?? 11;
      for (const linea of partir(texto, (t) => fuente.widthOfTextAtSize(t, tamano), anchoUtil)) {
        pagina.drawText(linea, { x: MARGEN, y, size: tamano, font: fuente, color: rgb(0, 0, 0) });
        y -= tamano * 1.5;
      }
    };
    const separar = (puntos = 12) => {
      y -= puntos;
    };

    escribir('Municipalidad Provincial de Huanta', { tamano: 12, negrita: true });
    escribir('Subgerencia de Licencias de Funcionamiento', { tamano: 10 });
    separar(16);
    escribir('Esquela de pago', { tamano: 20, negrita: true });
    separar();
    const datos: [string, string][] = [
      ['Código de la esquela', esquela.codigo],
      ['Número de expediente', esquela.numeroExpediente],
      ['Concepto', esquela.concepto],
      ['Monto a pagar', `S/ ${esquela.monto}`],
      ['Fecha de emisión', fechaLima(esquela.generadaEn)],
    ];
    for (const [etiqueta, valor] of datos) {
      escribir(etiqueta, { tamano: 9 });
      escribir(valor, { tamano: 13, negrita: true });
      separar(6);
    }
    separar(10);
    escribir('Cómo pagar', { tamano: 12, negrita: true });
    escribir(
      'Acércate a la caja de la Municipalidad Provincial de Huanta con el código de esta esquela. El cajero verificará el número de expediente y el monto, y te entregará un recibo.',
    );
    escribir(
      'Puedes consultar el estado de tu trámite con el número de expediente en el portal de licencias.',
    );
    return documento.save();
  }
}
