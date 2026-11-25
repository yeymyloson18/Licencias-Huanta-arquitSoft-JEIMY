import type { EnlaceOrientacion, TurnoOrientacion } from '../../servicios/clienteApi';

// Conversación del chat de orientación (012). Vive solo en la memoria de la página: se conserva al
// navegar entre páginas públicas y se pierde al recargar (FR-017). Nunca va a localStorage.

export interface MensajeChat {
  readonly id: number;
  readonly autor: 'PERSONA' | 'ORIENTADOR';
  readonly texto: string;
  readonly enlaces?: readonly EnlaceOrientacion[];
  readonly aclaracion?: string | null;
  readonly datoPersonalQuitado?: boolean;
}

/** Turnos que se envían como contexto de la conversación (FR-013). */
export const MAXIMO_TURNOS = 6;
const LARGO_MAXIMO_TURNO = 1200;

export const historialDe = (conversacion: readonly MensajeChat[]): TurnoOrientacion[] =>
  conversacion.slice(-MAXIMO_TURNOS).map((mensaje) => ({
    rol: mensaje.autor,
    texto: mensaje.texto.slice(0, LARGO_MAXIMO_TURNO),
  }));

export const siguienteId = (conversacion: readonly MensajeChat[]): number =>
  conversacion.reduce((maximo, mensaje) => Math.max(maximo, mensaje.id), 0) + 1;

/** Textos fijos del portal cuando el servicio no responde (contracts/portal-orientacion.md). */
export const TEXTO_NO_DISPONIBLE =
  "En este momento no puedo responder preguntas. Puede usar el asistente '¿Qué licencia " +
  "necesito?' o ver la lista de licencias.";

export const textoLimite = (segundos: number): string => {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return `Hizo muchas preguntas seguidas. Vuelva a intentarlo en ${String(minutos)} ${
    minutos === 1 ? 'minuto' : 'minutos'
  }.`;
};
