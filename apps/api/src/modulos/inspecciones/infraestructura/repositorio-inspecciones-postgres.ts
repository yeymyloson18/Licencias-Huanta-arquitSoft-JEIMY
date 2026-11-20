import { comoFechaBase, deFechaBase } from '../../../compartido/dominio/fecha-lima';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import {
  type EstadoInspeccion,
  Inspeccion,
  type ResultadoItse,
  type TipoInspeccion,
} from '../dominio/inspeccion';
import type { FiltroInspecciones, FotoGuardada, RepositorioInspecciones } from '../dominio/puertos';

interface FilaInspeccion {
  readonly id: string;
  readonly numero_expediente: string;
  readonly tipo: string;
  readonly estado: string;
  readonly inspector_id: string | null;
  readonly programada_para: Date | null;
  readonly resultado: string | null;
  readonly observaciones: string | null;
  readonly numero_certificado: string | null;
  readonly certificado_emitido_en: Date | null;
  readonly registrada_en: Date | null;
}

const aInspeccion = (fila: FilaInspeccion): Inspeccion =>
  Inspeccion.reconstruir({
    id: fila.id,
    numeroExpediente: fila.numero_expediente,
    tipo: fila.tipo as TipoInspeccion,
    estado: fila.estado as EstadoInspeccion,
    inspectorId: fila.inspector_id,
    programadaPara: fila.programada_para === null ? null : deFechaBase(fila.programada_para),
    resultado: fila.resultado as ResultadoItse | null,
    observaciones: fila.observaciones,
    numeroCertificado: fila.numero_certificado,
    certificadoEmitidoEn:
      fila.certificado_emitido_en === null ? null : deFechaBase(fila.certificado_emitido_en),
    registradaEn: fila.registrada_en,
  });

/** Pendientes primero, luego asignadas por fecha programada y al final las realizadas. */
const ORDEN_ESTADO: Record<EstadoInspeccion, number> = { PENDIENTE: 0, ASIGNADA: 1, REALIZADA: 2 };

/**
 * `inspecciones.*` en PostgreSQL (data-model §2 de la 006). Asignar y registrar son `UPDATE`
 * condicionales; la auditoría, las fotos y el evento van en la misma transacción.
 */
export class RepositorioInspeccionesPostgres implements RepositorioInspecciones {
  constructor(private readonly prisma: PrismaServicio) {}

  async crearSiNoExiste(numeroExpediente: string, tipo: TipoInspeccion): Promise<boolean> {
    // UNIQUE (numero_expediente, tipo): un evento repetido no duplica la inspección.
    const insertadas = await this.prisma.$executeRaw`
      INSERT INTO inspecciones.inspeccion (numero_expediente, tipo)
      VALUES (${numeroExpediente}, ${tipo})
      ON CONFLICT (numero_expediente, tipo) DO NOTHING`;
    return insertadas > 0;
  }

  async obtener(id: string): Promise<Inspeccion | null> {
    const fila = await this.prisma.inspeccion.findUnique({ where: { id } });
    return fila === null ? null : aInspeccion(fila);
  }

  async listar(filtro: FiltroInspecciones): Promise<{ total: number; datos: Inspeccion[] }> {
    const donde = {
      ...(filtro.inspectorId === null ? {} : { inspector_id: filtro.inspectorId }),
      ...(filtro.estado === null ? {} : { estado: filtro.estado }),
    };
    const filas = await this.prisma.inspeccion.findMany({
      where: donde,
      orderBy: [{ programada_para: 'asc' }, { creada_en: 'asc' }],
    });
    const ordenadas = filas
      .map(aInspeccion)
      .sort((a, b) => ORDEN_ESTADO[a.aDatos().estado] - ORDEN_ESTADO[b.aDatos().estado]);
    const desde = (filtro.pagina - 1) * filtro.porPagina;
    return { total: ordenadas.length, datos: ordenadas.slice(desde, desde + filtro.porPagina) };
  }

  asignar(inspeccion: Inspeccion, usuarioId: string, en: Date): Promise<boolean> {
    const datos = inspeccion.aDatos();
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.inspeccion.updateMany({
        where: { id: datos.id, estado: { not: 'REALIZADA' } },
        data: {
          estado: 'ASIGNADA',
          inspector_id: datos.inspectorId,
          programada_para:
            datos.programadaPara === null ? null : comoFechaBase(datos.programadaPara),
        },
      });
      if (count === 0) {
        return false;
      }
      await tx.auditoriaInspecciones.create({
        data: {
          usuario_id: usuarioId,
          accion: 'ASIGNAR_INSPECTOR',
          inspeccion_id: datos.id,
          numero_expediente: datos.numeroExpediente,
          detalle: { inspectorId: datos.inspectorId, programadaPara: datos.programadaPara },
          ocurrido_en: en,
        },
      });
      return true;
    });
  }

  registrarResultado(
    inspeccion: Inspeccion,
    fotos: readonly FotoGuardada[],
    en: Date,
  ): Promise<boolean> {
    const datos = inspeccion.aDatos();
    return this.prisma.$transaction(async (tx) => {
      // Solo si sigue ASIGNADA al mismo inspector: un segundo registro no cambia nada (409).
      const { count } = await tx.inspeccion.updateMany({
        where: { id: datos.id, estado: 'ASIGNADA', inspector_id: datos.inspectorId },
        data: {
          estado: 'REALIZADA',
          resultado: datos.resultado,
          observaciones: datos.observaciones,
          numero_certificado: datos.numeroCertificado,
          certificado_emitido_en:
            datos.certificadoEmitidoEn === null ? null : comoFechaBase(datos.certificadoEmitidoEn),
          registrada_en: en,
        },
      });
      if (count === 0) {
        return false;
      }
      await tx.foto.createMany({
        data: fotos.map((foto) => ({
          inspeccion_id: datos.id,
          clave_almacen: foto.clave,
          tipo_mime: foto.tipoMime,
          tamano_bytes: foto.tamanoBytes,
          tomada_en: en,
        })),
      });
      // Sin observaciones en la auditoría ni en el evento (texto libre, principio VII).
      await tx.auditoriaInspecciones.create({
        data: {
          usuario_id: datos.inspectorId ?? '',
          accion: 'REGISTRAR_RESULTADO',
          inspeccion_id: datos.id,
          numero_expediente: datos.numeroExpediente,
          detalle: { resultado: datos.resultado, fotos: fotos.length },
          ocurrido_en: en,
        },
      });
      await tx.evento_pendiente.create({
        data: {
          tipo: 'ResultadoITSERegistrado',
          datos: {
            numeroExpediente: datos.numeroExpediente,
            inspeccionId: datos.id,
            tipo: datos.tipo,
            resultado: datos.resultado,
          },
        },
      });
      return true;
    });
  }
}
