import type { FachadaCatalogo } from '../../catalogo/fachada';
import type { FuenteCatalogo, LicenciaVigente } from '../dominio/puertos';

// Adaptador del puerto FuenteCatalogo (012, research R-02): usa SOLO la fachada pública del módulo
// Catálogo, cuyas lecturas pasan por su caché de Redis (TTL ≤ 240 s). Nunca lee el esquema catalogo
// (principios I y III).

/** Lo que este adaptador usa de la fachada (permite un doble en las pruebas). */
export type LecturaCatalogo = Pick<FachadaCatalogo, 'listarRecetas' | 'obtenerRecetaVigente'>;

export class FuenteCatalogoFachada implements FuenteCatalogo {
  constructor(private readonly catalogo: LecturaCatalogo) {}

  async licenciasVigentes(): Promise<readonly LicenciaVigente[]> {
    const resumen = await this.catalogo.listarRecetas({ tipo: 'LICENCIA' });
    const recetas = await Promise.all(
      resumen.map((receta) => this.catalogo.obtenerRecetaVigente(receta.codigo)),
    );
    return recetas.flatMap((receta) =>
      receta === null
        ? []
        : [
            {
              codigo: receta.codigo,
              nombre: receta.nombre,
              ruta: receta.ruta,
              tasa: receta.tasa,
              plazoDias: receta.plazoDias,
              tipoPlazo: receta.tipoPlazo,
              calificacion: receta.calificacion,
              ordenItse: receta.ordenItse,
              plazoItseDias: receta.plazoItseDias,
              vigenciaMeses: receta.vigenciaMeses,
              requisitos: [...receta.requisitos]
                .sort((a, b) => a.orden - b.orden)
                .map((requisito) => requisito.descripcion),
            },
          ],
    );
  }
}
