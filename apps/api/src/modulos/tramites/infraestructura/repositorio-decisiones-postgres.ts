import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { esEstadoExpediente } from '../dominio/estado-publico';
import type { Ruta } from '../dominio/maquina-estados';
import type {
  Decision,
  ExpedienteParaDecidir,
  RepositorioDecisiones,
} from '../dominio/puertos/repositorio-decisiones';

const comoRuta = (valor: string): Ruta => {
  const ruta = valor.trim();
  if (ruta !== 'A' && ruta !== 'B' && ruta !== 'C') {
    throw new Error('Ruta de expediente desconocida en la base');
  }
  return ruta;
};

/**
 * Decisiones del evaluador en PostgreSQL (research §R-05 de la 005): un `UPDATE` condicional por
 * estado y versión y, en la misma transacción, el historial, la auditoría, la observación y los
 * eventos de `comun.evento_pendiente`. Si el `UPDATE` no cambia ninguna fila, no escribe nada más.
 */
export class RepositorioDecisionesPostgres implements RepositorioDecisiones {
  constructor(private readonly prisma: PrismaServicio) {}

  async obtenerParaDecidir(numero: string): Promise<ExpedienteParaDecidir | null> {
    const fila = await this.prisma.expediente.findUnique({
      where: { numero },
      select: {
        id: true,
        numero: true,
        estado: true,
        ruta: true,
        codigo_receta: true,
        version: true,
        _count: { select: { observacion: true } },
      },
    });
    if (fila === null) {
      return null;
    }
    if (!esEstadoExpediente(fila.estado)) {
      throw new Error('Estado de expediente desconocido en la base');
    }
    return {
      id: fila.id,
      numero: fila.numero,
      estado: fila.estado,
      ruta: comoRuta(fila.ruta),
      codigoReceta: fila.codigo_receta,
      version: fila.version,
      yaObservado: fila._count.observacion > 0,
    };
  }

  aplicar(decision: Decision): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const cambios = decision.cambios ?? {};
      const { count } = await tx.expediente.updateMany({
        where: {
          id: decision.expedienteId,
          estado: decision.estadoEsperado,
          version: decision.versionEsperada,
        },
        data: {
          estado: decision.estadoNuevo,
          version: { increment: 1 },
          actualizado_en: decision.en,
          ...(cambios.codigoReceta === undefined ? {} : { codigo_receta: cambios.codigoReceta }),
          ...(cambios.ruta === undefined ? {} : { ruta: cambios.ruta }),
          ...(cambios.nivelRiesgoPropuesto === undefined
            ? {}
            : { nivel_riesgo_propuesto: cambios.nivelRiesgoPropuesto }),
          ...(cambios.nivelRiesgoConfirmado === undefined
            ? {}
            : { nivel_riesgo_confirmado: cambios.nivelRiesgoConfirmado }),
          ...(cambios.evaluadorId === undefined ? {} : { evaluador_id: cambios.evaluadorId }),
        },
      });
      if (count === 0) {
        return false;
      }
      const pasos = decision.historial ?? [
        {
          estadoAnterior: decision.estadoEsperado,
          estadoNuevo: decision.estadoNuevo,
          comentario: decision.comentario,
        },
      ];
      // Un milisegundo entre pasos: el historial se ordena por `ocurrido_en`.
      for (const [indice, paso] of pasos.entries()) {
        await tx.historial_estado.create({
          data: {
            expediente_id: decision.expedienteId,
            estado_anterior: paso.estadoAnterior,
            estado_nuevo: paso.estadoNuevo,
            usuario_id: decision.usuarioId,
            comentario: paso.comentario,
            ocurrido_en: new Date(decision.en.getTime() + indice),
          },
        });
      }
      if (decision.auditoria !== null) {
        await tx.auditoriaTramites.create({
          data: {
            usuario_id: decision.usuarioId,
            accion: decision.auditoria.accion,
            numero_expediente: decision.numero,
            detalle: decision.auditoria.detalle ?? undefined,
            ocurrido_en: decision.en,
          },
        });
      }
      if (decision.observacion !== undefined && decision.usuarioId !== null) {
        await tx.observacion.create({
          data: {
            expediente_id: decision.expedienteId,
            descripcion: decision.observacion.descripcion,
            plazo_subsanar_en: decision.observacion.plazoSubsanarEn,
            creada_por: decision.usuarioId,
            creada_en: decision.en,
          },
        });
      }
      if (decision.eventos.length > 0) {
        await tx.evento_pendiente.createMany({
          data: decision.eventos.map((evento) => ({
            tipo: evento.tipo,
            datos: { ...evento.datos },
          })),
        });
      }
      return true;
    });
  }
}
