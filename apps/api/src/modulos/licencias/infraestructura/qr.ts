import qrcode from 'qrcode-generator';

/**
 * Matriz del código QR (research §R-09 de la 006) con `qrcode-generator`: versión automática y
 * corrección de errores nivel M. `true` = módulo oscuro. Se dibuja como vector en el PDF.
 */
export const matrizQr = (texto: string): boolean[][] => {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const tamano = qr.getModuleCount();
  return Array.from({ length: tamano }, (_, fila) =>
    Array.from({ length: tamano }, (_, columna) => qr.isDark(fila, columna)),
  );
};
