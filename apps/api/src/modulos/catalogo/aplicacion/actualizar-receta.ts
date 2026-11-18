import type { CambiosReceta } from '../dominio/cambios-receta';
import type { InvalidadorCacheCatalogo } from '../dominio/invalidador-cache-catalogo';
import { aplicarCambios } from '../dominio/aplicar-cambios';
import type { RecetaCompleta } from '../dominio/receta-completa';
import type { Reloj } from '../dominio/reloj';
import type { UnidadDeTrabajoCatalogo } from '../dominio/unidad-de-trabajo-catalogo';

export type ResultadoActualizacion =
  | {
      readonly tipo: 'ACTUALIZADA';
      readonly receta: RecetaCompleta;
      /** Campos que cambiaron (vacío si el cambio era idéntico a lo guardado). */
      readonly campos: readonly string[];
    }
  | { readonly tipo: 'NO_ENCONTRADA' };

/**
 * Caso de uso: actualizar una receta cuando cambia el TUPA (RF21, FR-017 a FR-024). El valor "antes"
 * es el guardado al momento de bloquear la receta, así que gana el último que guarda y cada guardado
 * tiene su registro (aclaración 5). Lanza `ErrorValidacionReceta` sin guardar nada.
 */
export class ActualizarReceta {
  constructor(
    private readonly unidadDeTrabajo: UnidadDeTrabajoCatalogo,
    private readonly invalidador: InvalidadorCacheCatalogo,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    codigo: string,
    cambios: CambiosReceta,
    usuarioId: string,
  ): Promise<ResultadoActualizacion> {
    const salida = await this.unidadDeTrabajo.ejecutar(codigo, (receta) => {
      const { receta: nueva, diferencias } = aplicarCambios(receta, cambios);
      const campos = Object.keys(diferencias);
      return {
        guardar:
          campos.length === 0
            ? null
            : { receta: nueva, diferencias, usuarioId, en: this.reloj.ahora() },
        resultado: campos,
      };
    });

    if (salida === null) {
      return { tipo: 'NO_ENCONTRADA' };
    }

    if (salida.resultado.length > 0) {
      // Después de confirmar (research §R-06). Si la caché falla, el TTL pone el límite.
      try {
        await this.invalidador.invalidar(codigo);
      } catch {
        // El invalidador ya avisa en el registro; el guardado está confirmado.
      }
    }

    return { tipo: 'ACTUALIZADA', receta: salida.receta, campos: salida.resultado };
  }
}
