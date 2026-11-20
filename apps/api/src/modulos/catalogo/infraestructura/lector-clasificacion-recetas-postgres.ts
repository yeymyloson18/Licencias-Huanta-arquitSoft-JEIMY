import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type {
  ClasificacionReceta,
  LectorClasificacionRecetas,
} from '../dominio/lector-clasificacion-recetas';

/** Lectura directa (sin caché): son dos columnas que no cambian desde la semilla. */
export class LectorClasificacionRecetasPostgres implements LectorClasificacionRecetas {
  constructor(private readonly prisma: PrismaServicio) {}

  async obtener(codigo: string): Promise<ClasificacionReceta | null> {
    const fila = await this.prisma.receta.findUnique({
      where: { codigo },
      select: { es_cesionario: true, es_corporativa: true },
    });
    return fila === null
      ? null
      : { esCesionario: fila.es_cesionario, esCorporativa: fila.es_corporativa };
  }
}
