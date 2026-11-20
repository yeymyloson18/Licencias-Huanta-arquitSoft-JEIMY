import type { GrupoLicencia } from '../grupo-licencia';
import type { Ruta } from '../maquina-estados';
import type { NivelRiesgo } from './repositorio-expedientes';

/** Licencia vigente vista por el evaluador (de la fachada de Catálogo). */
export interface LicenciaParaEvaluacion {
  readonly codigo: string;
  readonly nombre: string;
  readonly ruta: Ruta;
  /** Soles con dos decimales. */
  readonly tasa: string;
  readonly nivelRiesgo: NivelRiesgo | null;
  readonly grupo: GrupoLicencia;
}

/** Puerto: licencias vigentes para confirmar o corregir el riesgo (FR-003 de la 005). */
export interface CatalogoEvaluacion {
  obtener(codigo: string): Promise<LicenciaParaEvaluacion | null>;
  listar(): Promise<LicenciaParaEvaluacion[]>;
}
