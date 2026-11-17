import {
  calcularEstadoGeneral,
  type EstadoDependencia,
  type EstadoSalud,
} from '../dominio/estado-salud';
import type { SondaDependencia } from '../dominio/sonda-dependencia';
import { conTiempoLimite } from './con-tiempo-limite';

/**
 * Caso de uso del chequeo de salud (EQ-03). Consulta ambas dependencias en paralelo, cada una con
 * su tiempo límite, para responder en un tiempo acotado aunque una se quede colgada (FR-010).
 */
export class ConsultarSalud {
  constructor(
    private readonly sondaBaseDeDatos: SondaDependencia,
    private readonly sondaCache: SondaDependencia,
    private readonly timeoutMs: number,
    private readonly version: string,
  ) {}

  async ejecutar(): Promise<EstadoSalud> {
    const [baseDeDatos, cache] = await Promise.all([
      this.comprobar(this.sondaBaseDeDatos),
      this.comprobar(this.sondaCache),
    ]);

    return {
      estado: calcularEstadoGeneral(baseDeDatos, cache),
      baseDeDatos,
      cache,
      version: this.version,
    };
  }

  private async comprobar(sonda: SondaDependencia): Promise<EstadoDependencia> {
    try {
      await conTiempoLimite(sonda.comprobar(), this.timeoutMs);
      return 'OK';
    } catch {
      // El motivo del fallo no se propaga: la respuesta no debe revelar detalles internos (FR-011).
      return 'CAIDO';
    }
  }
}
