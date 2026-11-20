import type { DatosEsquela } from '../esquela';

/**
 * Puerto: dibuja la esquela en PDF (research §R-07 de la 005). Recibe solo los datos de la esquela,
 * que no tienen datos personales del titular: así el PDF nunca puede mostrarlos (FR-018).
 */
export interface PdfEsquela {
  generar(esquela: DatosEsquela): Promise<Uint8Array>;
}
