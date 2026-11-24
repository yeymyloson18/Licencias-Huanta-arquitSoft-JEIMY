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

  // 009: el cambio y el evento para la auditoría de Seguridad van en UNA sentencia (CTE), así que
  // son atómicos sin abrir una transacción interactiva (research §R-02). Si no hubo cambio (fecha
  // repetida o inexistente), no se publica nada.

  async registrar(feriado: Feriado, usuarioId: string): Promise<'REGISTRADO' | 'REPETIDO'> {
    const filas = await this.prisma.$queryRaw<{ fecha: Date }[]>`
      WITH insertado AS (
        INSERT INTO plazos.feriado (fecha, descripcion, alcance, registrado_por)
        VALUES (${feriado.fecha}::date, ${feriado.descripcion}, ${feriado.alcance}, ${usuarioId}::uuid)
        ON CONFLICT (fecha) DO NOTHING
        RETURNING fecha
      ), evento AS (
        INSERT INTO comun.evento_pendiente (tipo, datos)
        SELECT 'FeriadoRegistrado',
               jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'), 'usuarioId', ${usuarioId}::text,
                                  'en', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          FROM insertado
      )
      SELECT fecha FROM insertado`;
    return filas.length > 0 ? 'REGISTRADO' : 'REPETIDO';
  }

  async eliminar(fecha: Fecha, usuarioId: string): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ fecha: Date }[]>`
      WITH borrado AS (
        DELETE FROM plazos.feriado WHERE fecha = ${fecha}::date RETURNING fecha
      ), evento AS (
        INSERT INTO comun.evento_pendiente (tipo, datos)
        SELECT 'FeriadoEliminado',
               jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'), 'usuarioId', ${usuarioId}::text,
                                  'en', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          FROM borrado
      )
      SELECT fecha FROM borrado`;
    return filas.length > 0;
  }
}
