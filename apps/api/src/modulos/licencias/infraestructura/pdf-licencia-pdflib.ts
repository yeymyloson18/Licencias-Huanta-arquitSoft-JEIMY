import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { fechaLima } from '../../../compartido/dominio/fecha-lima';
import type { DatosLicencia } from '../dominio/licencia';
import type { PdfLicencia } from '../dominio/puertos';
import { matrizQr } from './qr';

const ANCHO = 595; // A4 en puntos
const ALTO = 842;
const MARGEN = 56;
const LADO_QR = 150;

const fechaLarga = (fecha: string): string =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${fecha}T00:00:00Z`),
  );

/** Dibuja el QR módulo por módulo (vectorial: nítido al imprimir). */
const dibujarQr = (pagina: PDFPage, texto: string, x: number, y: number): void => {
  const matriz = matrizQr(texto);
  const modulo = LADO_QR / (matriz.length + 8); // 4 módulos de margen blanco por lado
  matriz.forEach((fila, i) => {
    fila.forEach((oscuro, j) => {
      if (oscuro) {
        pagina.drawRectangle({
          x: x + (j + 4) * modulo,
          y: y + LADO_QR - (i + 5) * modulo,
          width: modulo,
          height: modulo,
          color: rgb(0, 0, 0),
        });
      }
    });
  });
};

/**
 * Licencia en PDF (FR-017 de la 006): título, número, tipo, datos públicos, fechas, certificado ITSE y
 * el QR que apunta a la verificación pública. Sin documento, RUC, celular, correo ni dirección.
 */
export class PdfLicenciaPdfLib implements PdfLicencia {
  async generar(licencia: DatosLicencia, urlVerificacion: string): Promise<Uint8Array> {
    const documento = await PDFDocument.create();
    documento.setTitle(`Licencia de funcionamiento ${licencia.numero}`);
    documento.setCreator('Municipalidad Provincial de Huanta');
    documento.setProducer('Sistema de Licencias de Funcionamiento');
    const pagina = documento.addPage([ANCHO, ALTO]);
    const normal = await documento.embedFont(StandardFonts.Helvetica);
    const negrita = await documento.embedFont(StandardFonts.HelveticaBold);
    let y = ALTO - MARGEN;

    const escribir = (texto: string, fuente: PDFFont = normal, tamano = 11) => {
      pagina.drawText(texto, { x: MARGEN, y, size: tamano, font: fuente, color: rgb(0, 0, 0) });
      y -= tamano * 1.6;
    };

    escribir('Municipalidad Provincial de Huanta', negrita, 12);
    escribir('Subgerencia de Licencias de Funcionamiento', normal, 10);
    y -= 14;
    escribir(
      licencia.tipo === 'PROVISIONAL'
        ? 'Licencia de funcionamiento provisional'
        : 'Licencia de funcionamiento',
      negrita,
      18,
    );
    escribir(licencia.numero, negrita, 14);
    y -= 8;
    const datos: [string, string][] = [
      ['Titular', licencia.titularPublico],
      ['Nombre comercial', licencia.nombreComercial ?? '—'],
      ['Giro', licencia.giro],
      ['Zona', licencia.zona],
      ['Emitida el', fechaLarga(fechaLima(licencia.emitidaEn))],
      [
        'Vigencia',
        licencia.vigenteHasta === null
          ? 'Indeterminada'
          : `Hasta el ${fechaLarga(licencia.vigenteHasta)}`,
      ],
      [
        'Certificado ITSE',
        licencia.certificado === null
          ? 'Pendiente'
          : `${licencia.certificado.numero}, vence el ${fechaLarga(licencia.certificado.venceEn)}`,
      ],
    ];
    for (const [etiqueta, valor] of datos) {
      escribir(etiqueta, normal, 9);
      escribir(valor, negrita, 12);
    }
    y -= 10;
    dibujarQr(pagina, urlVerificacion, MARGEN, y - LADO_QR);
    pagina.drawText('Escanee el código para verificar esta licencia.', {
      x: MARGEN + LADO_QR + 12,
      y: y - LADO_QR / 2,
      size: 10,
      font: normal,
    });
    pagina.drawText(urlVerificacion, {
      x: MARGEN,
      y: y - LADO_QR - 14,
      size: 8,
      font: normal,
    });
    return documento.save();
  }
}
