/**
 * Documento del titular enmascarado para el personal (contracts/consulta-y-bandeja.md de la 004):
 * primer carácter, asteriscos y los dos últimos (`40000021` → `4*****21`). Un valor muy corto se
 * oculta entero.
 */
export const enmascararDocumento = (documento: string): string => {
  const valor = documento.trim();
  if (valor.length <= 4) {
    return '*'.repeat(valor.length);
  }
  return `${valor.slice(0, 1)}${'*'.repeat(valor.length - 3)}${valor.slice(-2)}`;
};
