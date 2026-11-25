// Pregunta al chat de orientación (012, data-model.md): de 1 a 500 caracteres (FR-024), con hasta 6
// turnos anteriores de la misma conversación (FR-013). Los errores nunca repiten el texto (FR-015).

export const LARGO_MAXIMO_PREGUNTA = 500;
export const MAXIMO_TURNOS = 6;
export const LARGO_MAXIMO_TURNO = 1200;

export type RolTurno = 'PERSONA' | 'ORIENTADOR';

export interface TurnoConversacion {
  readonly rol: RolTurno;
  readonly texto: string;
  /**
   * Licencias que nombró esa respuesta del chat (los enlaces a fichas que recibió el portal). Solo se
   * usan para elegir el contexto de una pregunta de seguimiento (FR-027); nunca se confía en ellos
   * para mostrar datos: se cruzan con las licencias vigentes.
   */
  readonly codigosReceta?: readonly string[];
}

/** Turno tal como llega del portal (no confiable). */
export interface TurnoRecibido {
  readonly rol: string;
  readonly texto: string;
  readonly codigosReceta?: readonly string[];
}

export const MAXIMO_CODIGOS_TURNO = 4;
const CODIGO_RECETA = /^[A-Z]{3}-\d{2}$/;

const codigosValidos = (codigos: readonly string[] | undefined): boolean =>
  codigos === undefined ||
  (codigos.length <= MAXIMO_CODIGOS_TURNO && codigos.every((codigo) => CODIGO_RECETA.test(codigo)));

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
      if (
        !esRol(turno.rol) ||
        textoTurno.length === 0 ||
        textoTurno.length > LARGO_MAXIMO_TURNO ||
        !codigosValidos(turno.codigosReceta)
      ) {
        throw new ErrorPreguntaInvalida(
          'historial',
          `Cada turno tiene un rol válido, entre 1 y ${String(LARGO_MAXIMO_TURNO)} caracteres y ` +
            `hasta ${String(MAXIMO_CODIGOS_TURNO)} códigos de receta`,
        );
      }
      return {
        rol: turno.rol,
        texto: textoTurno,
        ...(turno.codigosReceta && turno.codigosReceta.length > 0
          ? { codigosReceta: [...turno.codigosReceta] }
          : {}),
      };
    });
    return new PreguntaOrientacion(limpio, turnos);
  }
}
