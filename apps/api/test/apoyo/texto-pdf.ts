import { inflateSync } from 'node:zlib';

/**
 * Texto aproximado de un PDF para las pruebas: el contenido sin comprimir más los flujos FlateDecode
 * descomprimidos. Sirve para comprobar qué aparece (y qué no) en el PDF de la esquela.
 */
export const textoDePdf = (pdf: Uint8Array): string => {
  const binario = Buffer.from(pdf);
  const partes: string[] = [binario.toString('latin1')];
  let desde = 0;
  for (;;) {
    const inicio = binario.indexOf('stream', desde, 'latin1');
    if (inicio === -1) {
      break;
    }
    const comienzo = inicio + (binario[inicio + 6] === 0x0d ? 8 : 7);
    const fin = binario.indexOf('endstream', comienzo, 'latin1');
    if (fin === -1) {
      break;
    }
    try {
      partes.push(inflateSync(binario.subarray(comienzo, fin)).toString('latin1'));
    } catch {
      // Flujo sin comprimir o de otro tipo: ya está en el texto plano.
    }
    desde = fin + 9;
  }
  return partes.join('\n');
};
