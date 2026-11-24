// Destino enmascarado para el asunto de los mensajes del buzón de pruebas (009, research §R-07):
// dice a quién iba sin mostrar el dato completo. Mismo estilo que el celular enmascarado de la 002.

/** `987654321` → `9*****321`. */
export const enmascararCelular = (celular: string): string =>
  celular.length < 4 ? '***' : `${celular.slice(0, 1)}*****${celular.slice(-3)}`;

/** `juan.perez@correo.pe` → `ju***@correo.pe`. Sin `@`, se enmascara todo. */
export const enmascararCorreo = (correo: string): string => {
  const arroba = correo.lastIndexOf('@');
  if (arroba < 1) {
    return '***';
  }
  return `${correo.slice(0, Math.min(2, arroba))}***${correo.slice(arroba)}`;
};

/** Según el canal del aviso: SMS → celular; CORREO → correo. */
export const enmascararDestino = (canal: 'SMS' | 'CORREO', destino: string): string =>
  canal === 'SMS' ? enmascararCelular(destino) : enmascararCorreo(destino);
