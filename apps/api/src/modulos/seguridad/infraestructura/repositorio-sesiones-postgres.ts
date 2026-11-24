import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { EventoAuditoria } from '../dominio/evento-auditoria';
import type {
  AuditoriaDeRevocacion,
  RepositorioSesiones,
} from '../dominio/puertos/repositorio-sesiones';
import { Sesion } from '../dominio/sesion';
import { insertarEventosAuditoria } from './repositorio-auditoria-postgres';
import { esUuid } from './uuid';

/** Adaptador de `seguridad.sesion` (refresh tokens del personal, solo sus huellas). */
export class RepositorioSesionesPostgres implements RepositorioSesiones {
  constructor(private readonly prisma: PrismaServicio) {}

  async crear(sesion: Sesion, auditoria: readonly EventoAuditoria[] = []): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.sesion.create({
        data: {
          id: sesion.id,
          usuario_id: sesion.usuarioId,
          creada_en: sesion.creadaEn,
          vence_maximo_en: sesion.venceMaximoEn,
          ...this.estado(sesion),
        },
      });
      await insertarEventosAuditoria(tx, auditoria);
    });
  }

  async obtenerPorId(id: string): Promise<Sesion | null> {
    if (!esUuid(id)) {
      return null;
    }
    const fila = await this.prisma.sesion.findUnique({ where: { id } });
    if (fila === null) {
      return null;
    }
    return Sesion.reconstruir({
      id: fila.id,
      usuarioId: fila.usuario_id,
      refreshHash: fila.refresh_hash,
      refreshAnteriorHash: fila.refresh_anterior_hash ?? undefined,
      rotadaEn: fila.rotada_en ?? undefined,
      creadaEn: fila.creada_en,
      venceMaximoEn: fila.vence_maximo_en,
      ultimaActividadEn: fila.ultima_actividad_en,
      revocadaEn: fila.revocada_en ?? undefined,
    });
  }

  async guardar(sesion: Sesion, auditoria: readonly EventoAuditoria[] = []): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.sesion.update({ where: { id: sesion.id }, data: this.estado(sesion) });
      await insertarEventosAuditoria(tx, auditoria);
    });
  }

  revocarTodasDelUsuario(
    usuarioId: string,
    ahora: Date,
    auditoria?: AuditoriaDeRevocacion,
  ): Promise<string[]> {
    return this.revocar({ usuario_id: usuarioId }, ahora, auditoria);
  }

  revocarTodasMenos(usuarioId: string, sesionId: string, ahora: Date): Promise<string[]> {
    return this.revocar({ usuario_id: usuarioId, id: { not: sesionId } }, ahora);
  }

  private async revocar(
    filtro: { usuario_id: string; id?: { not: string } },
    ahora: Date,
    auditoria?: AuditoriaDeRevocacion,
  ): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const vigentes = await tx.sesion.findMany({
        where: { ...filtro, revocada_en: null },
        select: { id: true },
      });
      const ids = vigentes.map((fila) => fila.id);
      if (ids.length > 0) {
        await tx.sesion.updateMany({
          where: { id: { in: ids }, revocada_en: null },
          data: { revocada_en: ahora },
        });
      }
      if (auditoria !== undefined) {
        await insertarEventosAuditoria(tx, auditoria(ids));
      }
      return ids;
    });
  }

  private estado(sesion: Sesion) {
    return {
      refresh_hash: sesion.refreshHash,
      refresh_anterior_hash: sesion.refreshAnteriorHash ?? null,
      rotada_en: sesion.rotadaEn ?? null,
      ultima_actividad_en: sesion.ultimaActividadEn,
      revocada_en: sesion.revocadaEn ?? null,
    };
  }
}
