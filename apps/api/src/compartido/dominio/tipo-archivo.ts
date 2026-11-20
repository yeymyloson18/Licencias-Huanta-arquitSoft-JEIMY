// Tipo real de un archivo subido, por sus primeros bytes (FR-013 de la 004, research §R-08). No se
// confía en la extensión ni en el `Content-Type` que envía el navegador.

export type TipoArchivo = 'application/pdf' | 'image/jpeg' | 'image/png';

export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

const FIRMAS: readonly { readonly tipo: TipoArchivo; readonly bytes: readonly number[] }[] = [
  { tipo: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** Devuelve el tipo si los primeros bytes son de PDF, JPEG o PNG; si no, `null`. */
export const detectarTipoArchivo = (contenido: Uint8Array): TipoArchivo | null =>
  FIRMAS.find(({ bytes }) => bytes.every((byte, indice) => contenido[indice] === byte))?.tipo ??
  null;
