import type { z } from 'zod';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';

/**
 * Valida un cuerpo con zod y, si falla, lanza `ErrorValidacion` (422) con un mensaje por campo.
 * Los mensajes son fijos por campo: nunca repiten el valor recibido (FR-029).
 */
export const validarCuerpo = <T>(
  esquema: z.ZodType<T>,
  cuerpo: unknown,
  mensajes: Readonly<Record<string, string>>,
): T => {
  const resultado = esquema.safeParse(cuerpo ?? {});
  if (resultado.success) {
    return resultado.data;
  }
  const campos = [
    ...new Set(resultado.error.issues.map((problema) => String(problema.path[0] ?? 'cuerpo'))),
  ];
  throw new ErrorValidacion(
    campos.map((campo) => ({ campo, mensaje: mensajes[campo] ?? 'Valor no válido' })),
  );
};
