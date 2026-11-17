import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { crearReceta, esRuta, esTipoReceta, type Receta } from '../dominio/receta';
import type { FiltroRecetas, RepositorioCatalogo } from '../dominio/repositorio-catalogo';

/** Adaptador: lee `catalogo.receta` (solo el esquema propio del módulo, principio III). */
export class RepositorioCatalogoPostgres implements RepositorioCatalogo {
  constructor(private readonly prisma: PrismaServicio) {}

  async listarActivas(filtro: FiltroRecetas): Promise<Receta[]> {
    const filas = await this.prisma.receta.findMany({
      where: { activa: true, ...(filtro.tipo ? { tipo: filtro.tipo } : {}) },
      orderBy: { codigo: 'asc' },
      select: { codigo: true, nombre: true, tipo: true, ruta: true, tasa: true, plazo_dias: true },
    });

    return filas.map((fila) => {
      // Los CHECK de esquema.sql garantizan estos valores; se validan igual al cruzar la frontera.
      if (!esTipoReceta(fila.tipo)) {
        throw new Error(`Tipo de receta desconocido en ${fila.codigo}`);
      }
      const ruta = fila.ruta?.trim() ?? null;
      if (ruta !== null && !esRuta(ruta)) {
        throw new Error(`Ruta desconocida en ${fila.codigo}`);
      }
      return crearReceta({
        codigo: fila.codigo,
        nombre: fila.nombre,
        tipo: fila.tipo,
        ruta,
        tasa: fila.tasa.toFixed(2),
        plazoDias: fila.plazo_dias,
      });
    });
  }
}
