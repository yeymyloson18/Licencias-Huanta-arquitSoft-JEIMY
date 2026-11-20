import type { ListarRecetas, RecetaResumenDto } from './aplicacion/listar-recetas';
import type { ObtenerFicha } from './aplicacion/obtener-ficha';
import type { LectorClasificacionRecetas } from './dominio/lector-clasificacion-recetas';
import type { FiltroRecetas } from './dominio/repositorio-catalogo';

// Fachada pública del módulo Catálogo: la ÚNICA entrada que otros módulos pueden importar
// (constitución, principio I; regla de dependencia "aislamiento-entre-modulos").

export type { RecetaResumenDto } from './aplicacion/listar-recetas';
export type { TipoReceta } from './dominio/receta';
export type { FiltroRecetas } from './dominio/repositorio-catalogo';

/** Requisito de una receta vigente, tal como lo copia `tramites` al presentar (004). */
export interface RequisitoVigenteDto {
  readonly id: number;
  readonly orden: number;
  readonly descripcion: string;
  readonly obligatorio: boolean;
  readonly condicion: 'SIEMPRE' | 'CON_REPRESENTANTE' | 'GIRO_ESPECIAL' | 'SIN_PLANOS_VIGENTES';
}

/** Licencia que se puede presentar hoy: activa y de tipo LICENCIA (FR-008 y FR-017 de la 004). */
export interface RecetaVigenteDto {
  readonly codigo: string;
  readonly nombre: string;
  readonly ruta: 'A' | 'B' | 'C';
  readonly tasa: string;
  readonly plazoDias: number | null;
  readonly tipoPlazo: 'HABILES' | 'CALENDARIO';
  readonly calificacion:
    'APROBACION_AUTOMATICA' | 'EVALUACION_PREVIA_SILENCIO_POSITIVO' | 'SERVICIO_EXCLUSIVO';
  readonly ordenItse: 'POSTERIOR' | 'PREVIA' | 'DENTRO_6_MESES' | null;
  readonly plazoItseDias: number | null;
  readonly vigenciaMeses: number | null;
  /** En el orden del catálogo. */
  readonly requisitos: readonly RequisitoVigenteDto[];
}

/** Licencia vista por el evaluador para confirmar o corregir el riesgo (FR-003 de la 005). */
export interface RecetaParaEvaluacionDto {
  readonly codigo: string;
  readonly nombre: string;
  readonly ruta: 'A' | 'B' | 'C';
  /** Soles con dos decimales, por ejemplo "177.10". */
  readonly tasa: string;
  readonly nivelRiesgo: 'BAJO' | 'MEDIO' | 'ALTO' | 'MUY_ALTO' | null;
  readonly esCesionario: boolean;
  readonly esCorporativa: boolean;
}

export class FachadaCatalogo {
  constructor(
    private readonly listarRecetasCasoDeUso: ListarRecetas,
    private readonly obtenerFichaCasoDeUso: ObtenerFicha,
    private readonly clasificacion?: LectorClasificacionRecetas,
  ) {}

  /**
   * Licencia activa con lo que necesita el evaluador para confirmar o corregir el riesgo; `null` si
   * no existe, está desactivada o no es una licencia (005).
   */
  async obtenerRecetaParaEvaluacion(codigo: string): Promise<RecetaParaEvaluacionDto | null> {
    const receta = await this.obtenerFichaCasoDeUso.ejecutar(codigo);
    if (!receta || receta.tipo !== 'LICENCIA' || receta.ruta === null) {
      return null;
    }
    const clasificacion = (await this.clasificacion?.obtener(codigo)) ?? null;
    if (clasificacion === null) {
      return null;
    }
    return {
      codigo: receta.codigo.valor,
      nombre: receta.nombre,
      ruta: receta.ruta,
      tasa: receta.tasa.aTextoSoles(),
      nivelRiesgo: receta.nivelRiesgo,
      ...clasificacion,
    };
  }

  /** Todas las licencias activas, con su clasificación (005). */
  async listarLicenciasParaEvaluacion(): Promise<RecetaParaEvaluacionDto[]> {
    const resumen = await this.listarRecetasCasoDeUso.ejecutar({ tipo: 'LICENCIA' });
    const recetas = await Promise.all(
      resumen.map((receta) => this.obtenerRecetaParaEvaluacion(receta.codigo)),
    );
    return recetas.filter((receta): receta is RecetaParaEvaluacionDto => receta !== null);
  }

  listarRecetas(filtro: FiltroRecetas): Promise<RecetaResumenDto[]> {
    return this.listarRecetasCasoDeUso.ejecutar(filtro);
  }

  /**
   * Receta vigente para presentar una solicitud: `null` si no existe, está desactivada o no es una
   * licencia (los trámites conectados quedan fuera de la 004).
   */
  async obtenerRecetaVigente(codigo: string): Promise<RecetaVigenteDto | null> {
    const receta = await this.obtenerFichaCasoDeUso.ejecutar(codigo);
    if (!receta || receta.tipo !== 'LICENCIA' || receta.ruta === null) {
      return null;
    }
    return {
      codigo: receta.codigo.valor,
      nombre: receta.nombre,
      ruta: receta.ruta,
      tasa: receta.tasa.aTextoSoles(),
      plazoDias: receta.plazoDias?.dias ?? null,
      tipoPlazo: receta.tipoPlazo,
      calificacion: receta.calificacion,
      ordenItse: receta.ordenItse,
      plazoItseDias: receta.plazoItseDias,
      vigenciaMeses: receta.vigenciaMeses,
      requisitos: receta.requisitos.map((requisito) => {
        // Las recetas leídas del catálogo siempre tienen sus requisitos guardados (con id).
        if (requisito.id === null) {
          throw new Error(`Requisito sin id en la receta ${receta.codigo.valor}`);
        }
        return {
          id: requisito.id,
          orden: requisito.orden,
          descripcion: requisito.descripcion,
          obligatorio: requisito.obligatorio,
          condicion: requisito.condicion,
        };
      }),
    };
  }
}
