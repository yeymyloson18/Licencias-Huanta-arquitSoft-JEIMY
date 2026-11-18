// Preguntas y reglas del asistente de ruta (data-model.md §2 de la 003). Vienen del catálogo, nunca
// del código (FR-002); en esta funcionalidad solo cambian por migración.

export interface OpcionPregunta {
  readonly valor: string;
  readonly texto: string;
}

export interface PreguntaAsistente {
  readonly codigo: string;
  readonly orden: number;
  readonly texto: string;
  readonly opciones: readonly OpcionPregunta[];
}

export interface ReglaAsistente {
  /** Se evalúan de menor a mayor; gana la primera que coincide. */
  readonly prioridad: number;
  /** Pares código de pregunta → valor; todas deben coincidir con las respuestas. */
  readonly condiciones: Readonly<Record<string, string>>;
  readonly codigoReceta: string;
}

export interface DatosAsistente {
  readonly preguntas: readonly PreguntaAsistente[];
  readonly reglas: readonly ReglaAsistente[];
}
