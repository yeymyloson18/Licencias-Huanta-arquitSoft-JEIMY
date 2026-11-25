import { z } from 'zod';
import { ErrorValidacion } from '../../../compartido/presentacion/filtro-problema';

// Cuerpo de POST /orientacion/preguntas, igual al contrato (`PreguntaOrientacion`, 012). Los errores
// nombran el campo y la regla, nunca repiten el texto (FR-015).

const esquemaTurno = z
  .object({
    rol: z.enum(['PERSONA', 'ORIENTADOR']),
    texto: z.string().min(1).max(1200),
    // Corrección de la 012 (FR-027): las licencias que nombró esa respuesta del chat.
    codigosReceta: z
      .array(z.string().regex(/^(LIC-0[1-9]|TRF-01|CGI-01|DUP-01)$/))
      .max(4)
      .optional(),
  })
  .strict();

export const esquemaPreguntaOrientacion = z
  .object({
    pregunta: z.string().min(1).max(500),
    historial: z.array(esquemaTurno).max(6).default([]),
  })
  .strict();

export type CuerpoPreguntaOrientacion = z.infer<typeof esquemaPreguntaOrientacion>;

const MENSAJES: Readonly<Record<string, string>> = {
  pregunta: 'Debe tener entre 1 y 500 caracteres',
  historial:
    'Hasta 6 turnos, cada uno con rol PERSONA u ORIENTADOR, entre 1 y 1,200 caracteres y hasta 4 ' +
    'códigos de receta',
};

export const leerPreguntaOrientacion = (cuerpo: unknown): CuerpoPreguntaOrientacion => {
  const resultado = esquemaPreguntaOrientacion.safeParse(cuerpo ?? {});
  if (!resultado.success) {
    const campos = [
      ...new Set(resultado.error.issues.map((problema) => String(problema.path[0] ?? 'cuerpo'))),
    ];
    throw new ErrorValidacion(
      campos.map((campo) => ({
        campo,
        mensaje: MENSAJES[campo] ?? 'Solo se permiten los campos pregunta e historial',
      })),
    );
  }
  return resultado.data;
};
