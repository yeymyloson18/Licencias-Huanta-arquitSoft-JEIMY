import type { FachadaCatalogo, RecetaParaEvaluacionDto } from '../../catalogo/fachada';
import { grupoDe } from '../dominio/grupo-licencia';
import type {
  CatalogoEvaluacion,
  LicenciaParaEvaluacion,
} from '../dominio/puertos/catalogo-evaluacion';

const aLicencia = (receta: RecetaParaEvaluacionDto): LicenciaParaEvaluacion => ({
  codigo: receta.codigo,
  nombre: receta.nombre,
  ruta: receta.ruta,
  tasa: receta.tasa,
  nivelRiesgo: receta.nivelRiesgo,
  grupo: grupoDe(receta),
});

/** Adaptador del puerto `CatalogoEvaluacion` sobre la fachada de Catálogo (principio I). */
export class CatalogoEvaluacionFachada implements CatalogoEvaluacion {
  constructor(private readonly catalogo: FachadaCatalogo) {}

  async obtener(codigo: string): Promise<LicenciaParaEvaluacion | null> {
    const receta = await this.catalogo.obtenerRecetaParaEvaluacion(codigo);
    return receta === null ? null : aLicencia(receta);
  }

  async listar(): Promise<LicenciaParaEvaluacion[]> {
    return (await this.catalogo.listarLicenciasParaEvaluacion()).map(aLicencia);
  }
}
