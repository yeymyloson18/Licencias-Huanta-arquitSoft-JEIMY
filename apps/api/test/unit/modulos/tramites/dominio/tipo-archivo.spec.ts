import { detectarTipoArchivo } from '../../../../../src/modulos/tramites/dominio/tipo-archivo';

const bytes = (...valores: number[]) => new Uint8Array([...valores, 0x00, 0x01, 0x02]);
const texto = (contenido: string) => new TextEncoder().encode(contenido);

describe('detectarTipoArchivo (FR-013, research §R-08 de la 004)', () => {
  it.each([
    ['un PDF', texto('%PDF-1.7\n...'), 'application/pdf'],
    ['un JPEG', bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg'],
    ['un PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png'],
  ])('reconoce %s por sus primeros bytes', (_, contenido, tipo) => {
    expect(detectarTipoArchivo(contenido)).toBe(tipo);
  });

  it.each([
    ['texto renombrado a .pdf', texto('hola, no soy un PDF')],
    ['un ZIP', bytes(0x50, 0x4b, 0x03, 0x04)],
    ['un ejecutable', bytes(0x4d, 0x5a, 0x90, 0x00)],
    ['un PDF cortado', texto('%PD')],
    ['un archivo vacío', new Uint8Array()],
  ])('rechaza %s', (_, contenido) => {
    expect(detectarTipoArchivo(contenido)).toBeNull();
  });
});
