import type { PreguntaAsistente } from '../dominio/pregunta-asistente';
import type { RepositorioCatalogo } from '../dominio/repositorio-catalogo';

/** Caso de uso: preguntas del asistente en orden, con sus opciones del catálogo (FR-002). */
export class ObtenerPreguntas {
  constructor(private readonly repositorio: RepositorioCatalogo) {}

  async ejecutar(): Promise<PreguntaAsistente[]> {
    const { preguntas } = await this.repositorio.obtenerAsistente();
    return [...preguntas].sort((primera, segunda) => primera.orden - segunda.orden);
  }
}
