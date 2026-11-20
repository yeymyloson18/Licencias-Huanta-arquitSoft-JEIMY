/**
 * Titular que se publica en la licencia y en la verificación del QR (FR-015 de la 006, research §R-11):
 * la razón social si existe; si no, el primer nombre completo y cada palabra siguiente abreviada a su
 * inicial ("Juana Pérez Quispe" → "Juana P. Q."). Nunca el documento.
 */
export const titularPublico = (datos: {
  readonly razonSocial: string | null;
  readonly nombreTitular: string;
}): string => {
  const razonSocial = datos.razonSocial?.trim() ?? '';
  if (razonSocial !== '') {
    return razonSocial;
  }
  const [primero = '', ...resto] = datos.nombreTitular.trim().split(/\s+/);
  const iniciales = resto.map((palabra) => `${palabra.charAt(0).toLocaleUpperCase('es-PE')}.`);
  return [primero, ...iniciales].join(' ');
};
