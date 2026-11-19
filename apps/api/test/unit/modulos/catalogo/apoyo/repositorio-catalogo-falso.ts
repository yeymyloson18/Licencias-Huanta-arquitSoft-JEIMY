import type { DatosAsistente } from '../../../../../src/modulos/catalogo/dominio/pregunta-asistente';
import type { Receta } from '../../../../../src/modulos/catalogo/dominio/receta';
import {
  crearRecetaCompleta,
  type RecetaCompleta,
} from '../../../../../src/modulos/catalogo/dominio/receta-completa';
import type {
  FiltroRecetas,
  RepositorioCatalogo,
} from '../../../../../src/modulos/catalogo/dominio/repositorio-catalogo';
import { leerSemillaAsistente, leerSemillaCatalogo } from './semilla-catalogo';

/**
 * Doble en memoria del repositorio del catálogo, cargado con datos-semilla.sql. Registra qué
 * recetas se pidieron para comprobar, por ejemplo, que el asistente no prueba otra regla.
 */
export class RepositorioCatalogoFalso implements RepositorioCatalogo {
  readonly recetasPedidas: string[] = [];
  recetas: RecetaCompleta[] = leerSemillaCatalogo().map(crearRecetaCompleta);
  asistente: DatosAsistente = leerSemillaAsistente();

  /** Marca una receta como desactivada, como si el administrador la hubiera desactivado. */
  desactivar(codigo: string): void {
    this.recetas = this.recetas.map((receta) =>
      receta.codigo.valor === codigo ? { ...receta, activa: false } : receta,
    );
  }

  listarActivas(filtro: FiltroRecetas): Promise<Receta[]> {
    return Promise.resolve(
      this.recetas.filter(
        (receta) => receta.activa && (filtro.tipo === undefined || receta.tipo === filtro.tipo),
      ),
    );
  }

  obtener(codigo: string): Promise<RecetaCompleta | null> {
    this.recetasPedidas.push(codigo);
    return Promise.resolve(this.recetas.find((receta) => receta.codigo.valor === codigo) ?? null);
  }

  listarTodas(): Promise<RecetaCompleta[]> {
    return Promise.resolve(this.recetas);
  }

  obtenerAsistente(): Promise<DatosAsistente> {
    return Promise.resolve(this.asistente);
  }
}
