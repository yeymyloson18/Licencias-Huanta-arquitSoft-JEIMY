// Textos fijos del chat de orientación (012, contracts/api-orientacion.md). Cuando el resultado no es
// RESPONDIDA, el administrado ve siempre estos textos, nunca el del modelo.

export const TEXTO_SIN_INFORMACION =
  'No tengo esa información. Le recomiendo consultar en Mesa de partes de la Municipalidad ' +
  'Provincial de Huanta.';

export const TEXTO_FUERA_DE_TEMA =
  'Solo puedo ayudarle con licencias de funcionamiento de la Municipalidad Provincial de Huanta. ' +
  'Puede preguntarme, por ejemplo, qué licencia necesita o cuánto cuesta.';

export const TEXTO_CONSULTA_TRAMITE =
  "Para ver el estado de su trámite use 'Consultar mi trámite' con su número de expediente y su " +
  'DNI o RUC. Por aquí no puedo ver expedientes.';

export const TEXTO_NO_DISPONIBLE =
  "En este momento no puedo responder preguntas. Puede usar el asistente '¿Qué licencia " +
  "necesito?' o ver la lista de licencias.";

/** FR-008: acompaña a toda respuesta RESPONDIDA. */
export const ACLARACION_ORIENTACION =
  'Esta es una orientación. Lo oficial es la ficha de cada licencia y la Municipalidad.';

/** Largo máximo del texto que ve el administrado (FR-011). */
export const LARGO_MAXIMO_RESPUESTA = 1200;
