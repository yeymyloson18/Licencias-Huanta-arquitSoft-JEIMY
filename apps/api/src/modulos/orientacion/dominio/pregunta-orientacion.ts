// Pregunta al chat de orientación (012, data-model.md): de 1 a 500 caracteres (FR-024), con hasta 6
// turnos anteriores de la misma conversación (FR-013). Los errores nunca repiten el texto (FR-015).

export const LARGO_MAXIMO_PREGUNTA = 500;
export const MAXIMO_TURNOS = 6;
export const LARGO_MAXIMO_TURNO = 1200;

export type RolTurno = 'PERSONA' | 'ORIENTADOR';

export interface TurnoConversacion {
  readonly rol: RolTurno;
  readonly texto: string;
}

/** Turno tal como llega del portal (no confiable). */
export interface TurnoRecibido {
  readonly rol: string;
  readonly texto: string;
}

export class ErrorPreguntaInvalida extends Error {
  constructor(
    readonly campo: 'pregunta' | 'historial',
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorPreguntaInvalida';
  }
}

const esRol = (rol: string): rol is RolTurno => rol === 'PERSONA' || rol === 'ORIENTADOR';

export class PreguntaOrientacion {
  private constructor(
    readonly texto: string,
    readonly historial: readonly TurnoConversacion[],
  ) {}

  static crear(texto: string, historial: readonly TurnoRecibido[] = []): PreguntaOrientacion {
    const limpio = texto.trim();
    if (limpio.length === 0 || limpio.length > LARGO_MAXIMO_PREGUNTA) {
      throw new ErrorPreguntaInvalida(
        'pregunta',
        `La pregunta debe tener entre 1 y ${String(LARGO_MAXIMO_PREGUNTA)} caracteres`,
      );
    }
    if (historial.length > MAXIMO_TURNOS) {
      throw new ErrorPreguntaInvalida(
        'historial',
        `El historial tiene como máximo ${String(MAXIMO_TURNOS)} turnos`,
      );
    }
    const turnos = historial.map((turno): TurnoConversacion => {
      const textoTurno = turno.texto.trim();
      if (!esRol(turno.rol) || textoTurno.length === 0 || textoTurno.length > LARGO_MAXIMO_TURNO) {
        throw new ErrorPreguntaInvalida(
          'historial',
          `Cada turno tiene un rol válido y entre 1 y ${String(LARGO_MAXIMO_TURNO)} caracteres`,
        );
      }
      return { rol: turno.rol, texto: textoTurno };
    });
    return new PreguntaOrientacion(limpio, turnos);
  }
}
