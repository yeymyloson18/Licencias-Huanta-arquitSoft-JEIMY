import { ErrorValidacionSolicitud } from './errores';

export const LARGO_MINIMO_TEXTO = 10;
export const LARGO_MAXIMO_TEXTO = 1000;

/**
 * Texto de la observación o del motivo de denegación (FR-007, FR-008 de la 005): de 10 a 1,000
 * caracteres sin contar los espacios de los extremos. Devuelve el texto recortado.
 */
export const validarTextoDecision = (texto: string, campo: string): string => {
  const limpio = texto.trim();
  if (limpio.length < LARGO_MINIMO_TEXTO || limpio.length > LARGO_MAXIMO_TEXTO) {
    throw new ErrorValidacionSolicitud([
      {
        campo,
        mensaje: `Debe tener entre ${String(LARGO_MINIMO_TEXTO)} y 1,000 caracteres`,
      },
    ]);
  }
  return limpio;
};
