import { ErrorDominio } from '../dominio/error-dominio';

/**
 * Convierte un texto en objeto de valor o anota el campo como inválido (sin su valor, FR-029).
 * Permite informar todos los campos inválidos juntos en un solo `ErrorDatosInvalidos`.
 */
export const leerCampo = <T>(campo: string, invalidos: string[], crear: () => T): T | null => {
  try {
    return crear();
  } catch (error) {
    if (error instanceof ErrorDominio) {
      invalidos.push(campo);
      return null;
    }
    throw error;
  }
};
