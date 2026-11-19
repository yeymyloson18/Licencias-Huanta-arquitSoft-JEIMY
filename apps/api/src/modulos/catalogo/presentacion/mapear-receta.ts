import type { components } from '@licencias/contracts';
import type { RecetaCompleta } from '../dominio/receta-completa';

type RecetaContrato = components['schemas']['Receta'];

/**
 * `RecetaCompleta` del dominio → esquema `Receta` del contrato. Lo usan la ficha pública, la
 * propuesta del asistente y la administración (research.md §R-07 de la 003).
 */
export const mapearReceta = (receta: RecetaCompleta): RecetaContrato => ({
  codigo: receta.codigo.valor,
  nombre: receta.nombre,
  tipo: receta.tipo,
  ruta: receta.ruta,
  tasa: receta.tasa.aTextoSoles(),
  plazoDias: receta.plazoDias?.dias ?? null,
  codigoTupa: receta.codigoTupa,
  paginaTupa: receta.paginaTupa,
  nivelRiesgo: receta.nivelRiesgo,
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
});
