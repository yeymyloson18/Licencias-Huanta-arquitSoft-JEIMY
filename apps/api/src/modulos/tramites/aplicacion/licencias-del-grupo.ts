import type { EstadoExpediente } from '../dominio/estado-publico';
import { mismoGrupo } from '../dominio/grupo-licencia';
import type {
  CatalogoEvaluacion,
  LicenciaParaEvaluacion,
} from '../dominio/puertos/catalogo-evaluacion';

/**
 * Licencias vigentes a las que el evaluador puede corregir el riesgo (FR-003 de la 005), incluida la
 * actual. Solo tiene sentido mientras el expediente está EN_EVALUACION; en otro estado, ninguna.
 */
export class LicenciasDelGrupo {
  constructor(private readonly catalogo: CatalogoEvaluacion) {}

  async ejecutar(expediente: {
    readonly estado: EstadoExpediente;
    readonly codigoReceta: string;
  }): Promise<LicenciaParaEvaluacion[]> {
    if (expediente.estado !== 'EN_EVALUACION') {
      return [];
    }
    const todas = await this.catalogo.listar();
    const actual = todas.find((licencia) => licencia.codigo === expediente.codigoReceta);
    if (actual === undefined) {
      return [];
    }
    return todas.filter((licencia) => mismoGrupo(licencia.grupo, actual.grupo));
  }
}
