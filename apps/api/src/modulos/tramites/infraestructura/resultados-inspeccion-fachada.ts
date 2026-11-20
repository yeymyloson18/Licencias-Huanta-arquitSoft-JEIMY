import type { FachadaInspecciones } from '../../inspecciones/fachada';
import type {
  ResultadoInspeccion,
  ResultadosInspeccion,
} from '../aplicacion/aplicar-resultado-itse';

/** Adaptador de `ResultadosInspeccion` sobre la fachada de Inspecciones (principio I). */
export class ResultadosInspeccionFachada implements ResultadosInspeccion {
  constructor(private readonly inspecciones: FachadaInspecciones) {}

  resultadoDe(inspeccionId: string): Promise<ResultadoInspeccion | null> {
    return this.inspecciones.resultadoDe(inspeccionId);
  }
}
