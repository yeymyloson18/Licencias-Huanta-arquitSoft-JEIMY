import { comoFechaBase, deFechaBase, type Fecha } from '../../../compartido/dominio/fecha-lima';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { AlcanceFeriado, Feriado } from '../dominio/feriado';
import type { RepositorioFeriados } from '../dominio/puertos';

/** `plazos.feriado` (la fecha es la clave primaria). */
export class RepositorioFeriadosPostgres implements RepositorioFeriados {
  constructor(private readonly prisma: PrismaServicio) {}

  async listar(anio: number): Promise<Feriado[]> {
    const filas = await this.prisma.feriado.findMany({
      where: {
        fecha: {
          gte: comoFechaBase(`${String(anio)}-01-01`),
          lte: comoFechaBase(`${String(anio)}-12-31`),
        },
      },
      orderBy: { fecha: 'asc' },
    });
    return filas.map((fila) => ({
      fecha: deFechaBase(fila.fecha),
      descripcion: fila.descripcion,
      alcance: fila.alcance as AlcanceFeriado,
    }));
  }

  async fechasEntre(desde: Fecha, hasta: Fecha): Promise<ReadonlySet<Fecha>> {
    const filas = await this.prisma.feriado.findMany({
      where: { fecha: { gte: comoFechaBase(desde), lte: comoFechaBase(hasta) } },
      select: { fecha: true },
    });
    return new Set(filas.map((fila) => deFechaBase(fila.fecha)));
  }

  async registrar(feriado: Feriado, usuarioId: string): Promise<'REGISTRADO' | 'REPETIDO'> {
    const insertados = await this.prisma.$executeRaw`
      INSERT INTO plazos.feriado (fecha, descripcion, alcance, registrado_por)
      VALUES (${feriado.fecha}::date, ${feriado.descripcion}, ${feriado.alcance}, ${usuarioId}::uuid)
      ON CONFLICT (fecha) DO NOTHING`;
    return insertados > 0 ? 'REGISTRADO' : 'REPETIDO';
  }

  async eliminar(fecha: Fecha): Promise<boolean> {
    const { count } = await this.prisma.feriado.deleteMany({
      where: { fecha: comoFechaBase(fecha) },
    });
    return count > 0;
  }
}
