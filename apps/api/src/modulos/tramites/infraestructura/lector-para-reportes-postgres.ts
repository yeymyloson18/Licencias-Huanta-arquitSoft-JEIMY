import { Prisma } from '@prisma/client';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import {
  ESTADOS_DECISION_FINAL,
  ESTADOS_EN_TRAMITE,
  type ExpedienteEnTramite,
  type ExpedienteTerminado,
  type LectorParaReportes,
} from '../dominio/puertos/lector-para-reportes';

interface FilaTerminado {
  readonly id: string;
  readonly numero: string;
  readonly codigo_receta: string;
  readonly presentado_en: Date;
  readonly terminado_en: Date;
}

/** Lecturas de `tramites` para el tablero y el reporte de la jefatura (007). */
export class LectorParaReportesPostgres implements LectorParaReportes {
  constructor(private readonly prisma: PrismaServicio) {}

  async conteoPorEstado(desde: Date, hasta: Date): Promise<Readonly<Record<string, number>>> {
    const grupos = await this.prisma.expediente.groupBy({
      by: ['estado'],
      where: { presentado_en: { gte: desde, lt: hasta } },
      _count: { _all: true },
    });
    return Object.fromEntries(grupos.map((grupo) => [grupo.estado, grupo._count._all]));
  }

  async terminados(desde: Date, hasta: Date): Promise<ExpedienteTerminado[]> {
    const decisiones = Prisma.join([...ESTADOS_DECISION_FINAL]);
    // Primera decisión final de los expedientes que tuvieron alguna en el rango (ix_historial_decision).
    const filas = await this.prisma.$queryRaw<FilaTerminado[]>`
      SELECT e.id, e.numero, e.codigo_receta, e.presentado_en, d.terminado_en
        FROM (SELECT expediente_id, MIN(ocurrido_en) AS terminado_en
                FROM tramites.historial_estado
               WHERE estado_nuevo IN (${decisiones})
                 AND expediente_id IN (SELECT expediente_id
                                         FROM tramites.historial_estado
                                        WHERE estado_nuevo IN (${decisiones})
                                          AND ocurrido_en >= ${desde} AND ocurrido_en < ${hasta})
               GROUP BY expediente_id) d
        JOIN tramites.expediente e ON e.id = d.expediente_id
       WHERE d.terminado_en >= ${desde} AND d.terminado_en < ${hasta}`;
    if (filas.length === 0) {
      return [];
    }
    const historial = await this.prisma.historial_estado.findMany({
      where: { expediente_id: { in: filas.map((fila) => fila.id) } },
      select: { expediente_id: true, estado_nuevo: true, ocurrido_en: true },
      orderBy: [{ expediente_id: 'asc' }, { ocurrido_en: 'asc' }, { id: 'asc' }],
    });
    const porExpediente = new Map<string, { estadoNuevo: string; ocurridoEn: Date }[]>();
    for (const paso of historial) {
      const lista = porExpediente.get(paso.expediente_id) ?? [];
      lista.push({ estadoNuevo: paso.estado_nuevo, ocurridoEn: paso.ocurrido_en });
      porExpediente.set(paso.expediente_id, lista);
    }
    return filas.map((fila) => ({
      numero: fila.numero,
      codigoReceta: fila.codigo_receta,
      presentadoEn: fila.presentado_en,
      terminadoEn: fila.terminado_en,
      historial: porExpediente.get(fila.id) ?? [],
    }));
  }

  async enTramite(codigoReceta: string | undefined): Promise<ExpedienteEnTramite[]> {
    const filas = await this.prisma.expediente.findMany({
      where: {
        estado: { in: [...ESTADOS_EN_TRAMITE] },
        ...(codigoReceta === undefined ? {} : { codigo_receta: codigoReceta }),
      },
      select: {
        numero: true,
        codigo_receta: true,
        razon_social: true,
        nombre_titular: true,
        giro: true,
        zona: true,
        estado: true,
        presentado_en: true,
      },
      orderBy: [{ presentado_en: 'asc' }, { numero: 'asc' }],
    });
    return filas.map((fila) => ({
      numero: fila.numero,
      codigoReceta: fila.codigo_receta,
      razonSocial: fila.razon_social,
      nombreTitular: fila.nombre_titular,
      giro: fila.giro,
      zona: fila.zona,
      estado: fila.estado,
      presentadoEn: fila.presentado_en,
    }));
  }
}
