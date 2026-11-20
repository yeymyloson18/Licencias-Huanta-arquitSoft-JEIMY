import type { Esquela } from '../esquela';

/** Puerto: `pagos.esquela`. */
export interface RepositorioEsquelas {
  /**
   * Inserta la esquela si el expediente todavía no tiene una (`numero_expediente` es único, ADR-004).
   * Devuelve `false` si ya existía: generar dos veces no duplica (idempotente).
   */
  crearSiNoExiste(esquela: Esquela): Promise<boolean>;
}
