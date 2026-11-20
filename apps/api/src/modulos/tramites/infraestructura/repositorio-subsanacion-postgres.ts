import { comoFechaBase } from '../../../compartido/dominio/fecha-lima';
import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { esEstadoExpediente } from '../dominio/estado-publico';
import type { Ruta } from '../dominio/maquina-estados';
import type {
  ExpedienteParaSubsanar,
  RepositorioSubsanacion,
  Subsanacion,
} from '../dominio/puertos/repositorio-subsanacion';
import { aBytes } from './comun-postgres';

/** Algún documento temporal ya no existe (lo usó otra subsanación o lo descartó la tarea de 24 h). */
class DocumentosNoDisponibles extends Error {}

const comoRuta = (valor: string): Ruta => {
  const ruta = valor.trim();
  if (ruta !== 'A' && ruta !== 'B' && ruta !== 'C') {
    throw new Error('Ruta de expediente desconocida en la base');
  }
  return ruta;
};

interface RecetaGuardada {
  readonly nombre?: unknown;
  readonly requisitos?: readonly { readonly id?: unknown; readonly orden?: unknown }[];
}

/** Subsanación en PostgreSQL (historia 4 de la 005): todo en una sola transacción. */
export class RepositorioSubsanacionPostgres implements RepositorioSubsanacion {
  constructor(
    private readonly prisma: PrismaServicio,
    private readonly protector: ProtectorDatos,
  ) {}

  async obtener(numero: string): Promise<ExpedienteParaSubsanar | null> {
    const fila = await this.prisma.expediente.findUnique({
      where: { numero },
      select: {
        id: true,
        numero: true,
        estado: true,
        version: true,
        ruta: true,
        codigo_receta: true,
        canal: true,
        presentado_en: true,
        vence_plazo_en: true,
        plazo_restante_dias: true,
        receta_al_presentar: true,
      },
    });
    if (fila === null) {
      return null;
    }
    if (!esEstadoExpediente(fila.estado)) {
      throw new Error('Estado de expediente desconocido en la base');
    }
    const receta = (fila.receta_al_presentar ?? {}) as RecetaGuardada;
    return {
      id: fila.id,
      numero: fila.numero,
      estado: fila.estado,
      version: fila.version,
      ruta: comoRuta(fila.ruta),
      codigoReceta: fila.codigo_receta,
      nombreLicencia: typeof receta.nombre === 'string' ? receta.nombre : fila.codigo_receta,
      canal: fila.canal === 'MESA_PARTES' ? 'MESA_PARTES' : 'EN_LINEA',
      presentadoEn: fila.presentado_en,
      vencePlazoEn: fila.vence_plazo_en,
      plazoRestanteDias: fila.plazo_restante_dias,
      requisitos: (receta.requisitos ?? []).flatMap((requisito) =>
        typeof requisito.id === 'number' && typeof requisito.orden === 'number'
          ? [{ id: requisito.id, orden: requisito.orden }]
          : [],
      ),
    };
  }

  async esDelTitular(numero: string, documento: string): Promise<boolean> {
    const huella = aBytes(this.protector.hmac(documento));
    const cuenta = await this.prisma.expediente.count({
      where: { numero, OR: [{ documento_hmac: huella }, { ruc_hmac: huella }] },
    });
    return cuenta > 0;
  }

  async subsanar(
    datos: Subsanacion,
  ): Promise<'SUBSANADO' | 'CAMBIO' | 'DOCUMENTOS_NO_DISPONIBLES'> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.expediente.updateMany({
          where: { id: datos.expedienteId, estado: 'OBSERVADO', version: datos.versionEsperada },
          data: {
            estado: 'EN_EVALUACION',
            version: { increment: 1 },
            actualizado_en: datos.en,
            ...(datos.vencePlazoEn === undefined
              ? {}
              : {
                  vence_plazo_en:
                    datos.vencePlazoEn === null ? null : comoFechaBase(datos.vencePlazoEn),
                  plazo_restante_dias: null,
                }),
          },
        });
        if (count === 0) {
          return 'CAMBIO' as const;
        }
        const ids = datos.documentos.map((documento) => documento.documentoId);
        const temporales = await tx.$queryRaw<
          {
            id: string;
            clave_almacen: string;
            nombre_original: string;
            tipo_mime: string;
            tamano_bytes: number;
            sha256: string;
            subido_en: Date;
          }[]
        >`SELECT id, clave_almacen, nombre_original, tipo_mime, tamano_bytes, sha256, subido_en
            FROM tramites.documento_temporal
           WHERE id = ANY(${ids}::uuid[])
             FOR UPDATE`;
        const porId = new Map(temporales.map((temporal) => [temporal.id, temporal]));
        if (porId.size !== new Set(ids).size) {
          throw new DocumentosNoDisponibles();
        }
        for (const documento of datos.documentos) {
          const temporal = porId.get(documento.documentoId);
          if (temporal === undefined) {
            throw new DocumentosNoDisponibles();
          }
          await tx.documento.create({
            data: {
              expediente_id: datos.expedienteId,
              requisito_id: BigInt(documento.requisitoId),
              requisito_orden: documento.requisitoOrden,
              nombre_original: temporal.nombre_original,
              clave_almacen: temporal.clave_almacen,
              tipo_mime: temporal.tipo_mime,
              tamano_bytes: temporal.tamano_bytes,
              sha256: temporal.sha256,
              subido_en: temporal.subido_en,
            },
          });
        }
        await tx.documento_temporal.deleteMany({ where: { id: { in: ids } } });
        await tx.observacion.updateMany({
          where: { expediente_id: datos.expedienteId, subsanada_en: null },
          data: { subsanada_en: datos.en },
        });
        await tx.historial_estado.create({
          data: {
            expediente_id: datos.expedienteId,
            estado_anterior: 'OBSERVADO',
            estado_nuevo: 'EN_EVALUACION',
            usuario_id: datos.usuarioId,
            comentario: 'Observación subsanada',
            ocurrido_en: datos.en,
          },
        });
        await tx.auditoriaTramites.create({
          data: {
            usuario_id: datos.usuarioId,
            accion: 'SUBSANAR',
            numero_expediente: datos.numero,
            detalle: { documentos: String(datos.documentos.length) },
            ocurrido_en: datos.en,
          },
        });
        await tx.evento_pendiente.create({
          data: {
            tipo: 'EstadoExpedienteCambiado',
            datos: {
              numeroExpediente: datos.numero,
              estadoAnterior: 'OBSERVADO',
              estadoNuevo: 'EN_EVALUACION',
            },
          },
        });
        return 'SUBSANADO' as const;
      });
    } catch (error) {
      if (error instanceof DocumentosNoDisponibles) {
        return 'DOCUMENTOS_NO_DISPONIBLES';
      }
      throw error;
    }
  }
}
