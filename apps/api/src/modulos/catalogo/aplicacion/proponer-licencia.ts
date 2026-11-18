import { proponerLicencia, type Respuestas } from '../dominio/motor-reglas-asistente';
import type { RecetaCompleta } from '../dominio/receta-completa';
import type { RepositorioCatalogo } from '../dominio/repositorio-catalogo';

export type ResultadoPropuesta =
  | { readonly tipo: 'PROPUESTA'; readonly receta: RecetaCompleta }
  | {
      readonly tipo: 'NO_DETERMINADA';
      readonly motivo: 'SIN_REGLA' | 'RECETA_NO_DISPONIBLE';
    };

/**
 * Caso de uso: propone la licencia que corresponde a las respuestas (RF01, RF02). Si la primera regla
 * que coincide apunta a una receta desactivada o inexistente, no prueba la siguiente (FR-006). Las
 * respuestas no se guardan ni se registran (FR-009). Lanza `ErrorRespuestasInvalidas` (FR-007).
 */
export class ProponerLicencia {
  constructor(private readonly repositorio: RepositorioCatalogo) {}

  async ejecutar(respuestas: Respuestas): Promise<ResultadoPropuesta> {
    const { preguntas, reglas } = await this.repositorio.obtenerAsistente();
    const resultado = proponerLicencia(preguntas, reglas, respuestas);

    if (resultado.tipo === 'NO_DETERMINADA') {
      return resultado;
    }

    const receta = await this.repositorio.obtener(resultado.codigoReceta);
    if (!receta?.activa) {
      return { tipo: 'NO_DETERMINADA', motivo: 'RECETA_NO_DISPONIBLE' };
    }
    return { tipo: 'PROPUESTA', receta };
  }
}
