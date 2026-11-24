import type { Prisma } from '@prisma/client';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type {
  AsignacionHistorial,
  CifrasUsuarios,
  ConsultaPanel,
} from '../dominio/puertos/consulta-panel';
import { esRol, type Rol } from '../dominio/rol';
import { TREINTA_MINUTOS_MS } from '../dominio/sesion';
import { esUuid } from './uuid';

const HEX = /^[0-9a-f]+$/;

const sesionesAbiertas = (ahora: Date): Prisma.sesionWhereInput => ({
  revocada_en: null,
  vence_maximo_en: { gt: ahora },
  ultima_actividad_en: { gt: new Date(ahora.getTime() - TREINTA_MINUTOS_MS) },
});

/** Conteos del panel sobre `seguridad.usuario`, `usuario_rol` y `sesion` (research §R-06, 009). */
export class ConsultaPanelPostgres implements ConsultaPanel {
  constructor(private readonly prisma: PrismaServicio) {}

  async cifrasUsuarios(ahora: Date): Promise<CifrasUsuarios> {
    const [activos, inactivos, roles, sesiones] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where: { activo: true } }),
      this.prisma.usuario.count({ where: { activo: false } }),
      this.prisma.usuario_rol.groupBy({
        by: ['rol_codigo'],
        where: { retirado_en: null, usuario: { activo: true } },
        orderBy: { rol_codigo: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.sesion.count({ where: sesionesAbiertas(ahora) }),
    ]);
    const porRol: Partial<Record<Rol, number>> = {};
    for (const fila of roles) {
      const cantidad = typeof fila._count === 'object' ? (fila._count._all ?? 0) : 0;
      if (esRol(fila.rol_codigo)) {
        porRol[fila.rol_codigo] = cantidad;
      }
    }
    return { activos, inactivos, porRol, sesionesAbiertas: sesiones };
  }

  async contarCuentasExistentes(correosHmac: readonly string[]): Promise<number> {
    const huellas = correosHmac.filter((hmac) => HEX.test(hmac) && hmac.length % 2 === 0);
    if (huellas.length === 0) {
      return 0;
    }
    return this.prisma.usuario.count({
      where: { correo_hmac: { in: huellas.map((hmac) => Buffer.from(hmac, 'hex')) } },
    });
  }

  async sesionesAbiertasDe(usuarioId: string, ahora: Date): Promise<number> {
    if (!esUuid(usuarioId)) {
      return 0;
    }
    return this.prisma.sesion.count({
      where: { usuario_id: usuarioId, ...sesionesAbiertas(ahora) },
    });
  }

  async historialRoles(usuarioId: string): Promise<readonly AsignacionHistorial[]> {
    if (!esUuid(usuarioId)) {
      return [];
    }
    const filas = await this.prisma.usuario_rol.findMany({
      where: { usuario_id: usuarioId },
      orderBy: [{ asignado_en: 'asc' }, { id: 'asc' }],
    });
    const ids = [
      ...new Set(
        filas.flatMap((fila) => [
          fila.asignado_por,
          ...(fila.retirado_por ? [fila.retirado_por] : []),
        ]),
      ),
    ];
    const nombres = new Map(
      (
        await this.prisma.usuario.findMany({
          where: { id: { in: ids } },
          select: { id: true, nombre_completo: true },
        })
      ).map((fila) => [fila.id, fila.nombre_completo]),
    );
    const persona = (id: string) => ({ id, nombre: nombres.get(id) ?? 'Usuario no encontrado' });
    return filas
      .filter((fila) => esRol(fila.rol_codigo))
      .map((fila) => ({
        rol: fila.rol_codigo as Rol,
        asignadoPor: persona(fila.asignado_por),
        asignadoEn: fila.asignado_en,
        retiradoPor: fila.retirado_por === null ? null : persona(fila.retirado_por),
        retiradoEn: fila.retirado_en,
      }));
  }
}
