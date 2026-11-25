import { extraerCifras } from './cifras';

// Revisión de cifras (012, FR-005 y research R-06): una respuesta del modelo solo se muestra si cada
// monto y cada plazo que menciona está en el contexto que se le envió (catálogo vigente y guía). Así
// "nunca inventa tasas, plazos ni requisitos" se puede comprobar con pruebas.

export interface RevisionCifras {
  readonly aprobada: boolean;
  /** Las cifras que no están en el contexto (solo para pruebas; nunca se registran). */
  readonly ajenas: readonly string[];
}

export const revisarCifras = (texto: string, permitidas: ReadonlySet<string>): RevisionCifras => {
  const ajenas = extraerCifras(texto).filter((cifra) => !permitidas.has(cifra));
  return { aprobada: ajenas.length === 0, ajenas };
};
