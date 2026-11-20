// Código de verificación del QR (research §R-10 de la 006): 16 bytes aleatorios en base64url = 22
// caracteres (128 bits), imposible de adivinar o de recorrer.

export const LARGO_BYTES_CODIGO = 16;

const PATRON_CODIGO = /^[A-Za-z0-9_-]{22}$/;

/** Convierte los 16 bytes aleatorios (los genera la infraestructura) en el código del QR. */
export const codigoDesdeBytes = (bytes: Uint8Array): string => {
  if (bytes.length !== LARGO_BYTES_CODIGO) {
    throw new Error('El código de verificación necesita 16 bytes aleatorios');
  }
  return Buffer.from(bytes).toString('base64url');
};

/** ¿Tiene la forma de un código? Un código mal formado se responde igual que uno inexistente. */
export const esCodigoVerificacion = (texto: string): boolean => PATRON_CODIGO.test(texto);
