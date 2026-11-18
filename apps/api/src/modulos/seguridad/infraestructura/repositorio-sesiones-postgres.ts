import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { RepositorioSesiones } from '../dominio/puertos/repositorio-sesiones';
import { Sesion } from '../dominio/sesion';
import { esUuid } from './uuid';

/** Adaptador de `seguridad.sesion` (refresh tokens del personal, solo sus huellas). */
export class RepositorioSesionesPostgres implements RepositorioSesiones {
  constructor(private readonly prisma: PrismaServicio) {}

  async crear(sesion: Sesion): Promise<void> {
    await this.prisma.sesion.create({
      data: {
        id: sesion.id,
        usuario_id: sesion.usuarioId,
        creada_en: sesion.creadaEn,
        vence_maximo_en: sesion.venceMaximoEn,
        ...this.estado(sesion),
      },
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

  async guardar(sesion: Sesion): Promise<void> {
    await this.prisma.sesion.update({ where: { id: sesion.id }, data: this.estado(sesion) });
  }

  revocarTodasDelUsuario(usuarioId: string, ahora: Date): Promise<string[]> {
    return this.revocar({ usuario_id: usuarioId }, ahora);
  }

  revocarTodasMenos(usuarioId: string, sesionId: string, ahora: Date): Promise<string[]> {
    return this.revocar({ usuario_id: usuarioId, id: { not: sesionId } }, ahora);
  }

  private async revocar(
    filtro: { usuario_id: string; id?: { not: string } },
    ahora: Date,
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
