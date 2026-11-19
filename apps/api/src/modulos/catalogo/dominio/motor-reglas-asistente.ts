import { ErrorDominio } from './error-dominio';
import type { PreguntaAsistente, ReglaAsistente } from './pregunta-asistente';

// Motor del asistente de ruta (RF01, research.md §R-02 de la 003): función pura que aplica las
// reglas guardadas como datos. No conoce ninguna pregunta, opción ni receta concreta (FR-002).

/** Código de pregunta → valor elegido. */
export type Respuestas = Readonly<Record<string, string>>;

export interface ErrorRespuesta {
  /** Código de la pregunta (o el código desconocido que llegó). */
  readonly pregunta: string;
  /** Nunca repite el valor recibido. */
  readonly mensaje: string;
}

export type ResultadoMotor =
  | { readonly tipo: 'PROPUESTA'; readonly codigoReceta: string }
  | { readonly tipo: 'NO_DETERMINADA'; readonly motivo: 'SIN_REGLA' };

/** Las respuestas no corresponden a las preguntas del asistente (FR-007). */
export class ErrorRespuestasInvalidas extends ErrorDominio {
  constructor(readonly errores: readonly ErrorRespuesta[]) {
    super('Las respuestas del asistente no son válidas');
    this.name = 'ErrorRespuestasInvalidas';
  }
}

const ordenarPorOrden = (preguntas: readonly PreguntaAsistente[]): PreguntaAsistente[] =>
  [...preguntas].sort((primera, segunda) => primera.orden - segunda.orden);

/**
 * Exige exactamente una respuesta por pregunta y que cada valor esté entre sus opciones. Devuelve
 * todos los errores, en el orden de las preguntas y luego los códigos desconocidos.
 */
export const validarRespuestas = (
  preguntas: readonly PreguntaAsistente[],
  respuestas: Respuestas,
): ErrorRespuesta[] => {
  const errores: ErrorRespuesta[] = [];

  for (const pregunta of ordenarPorOrden(preguntas)) {
    const valor = respuestas[pregunta.codigo];
    if (valor === undefined) {
      errores.push({ pregunta: pregunta.codigo, mensaje: 'Falta responder esta pregunta' });
    } else if (!pregunta.opciones.some((opcion) => opcion.valor === valor)) {
      errores.push({
        pregunta: pregunta.codigo,
        mensaje: 'El valor no está entre las opciones de la pregunta',
      });
    }
  }

  const codigos = new Set(preguntas.map((pregunta) => pregunta.codigo));
  for (const codigo of Object.keys(respuestas)) {
    if (!codigos.has(codigo)) {
      errores.push({ pregunta: codigo, mensaje: 'No es una pregunta del asistente' });
    }
  }

  return errores;
};

const coincide = (regla: ReglaAsistente, respuestas: Respuestas): boolean =>
  Object.entries(regla.condiciones).every(([pregunta, valor]) => respuestas[pregunta] === valor);

/**
 * Evalúa las reglas de menor a mayor prioridad y propone la receta de la primera que coincide (todas
 * sus condiciones son iguales a las respuestas; las preguntas que no menciona no importan).
 */
export const proponerLicencia = (
  preguntas: readonly PreguntaAsistente[],
  reglas: readonly ReglaAsistente[],
  respuestas: Respuestas,
): ResultadoMotor => {
  const errores = validarRespuestas(preguntas, respuestas);
  if (errores.length > 0) {
    throw new ErrorRespuestasInvalidas(errores);
  }

  const primera = [...reglas]
    .sort((una, otra) => una.prioridad - otra.prioridad)
    .find((regla) => coincide(regla, respuestas));

  return primera
    ? { tipo: 'PROPUESTA', codigoReceta: primera.codigoReceta }
    : { tipo: 'NO_DETERMINADA', motivo: 'SIN_REGLA' };
};
