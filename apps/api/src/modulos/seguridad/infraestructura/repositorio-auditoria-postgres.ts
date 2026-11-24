import { Prisma } from '@prisma/client';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { ACCIONES_INGRESO_FALLIDO, type AccionAuditoria } from '../dominio/accion-auditoria';
import type { EventoAuditoria, ResultadoAuditoria } from '../dominio/evento-auditoria';
import type {
  FilaAuditoria,
  FiltroAuditoria,
  PaginaAuditoria,
  RepositorioAuditoria,
} from '../dominio/puertos/repositorio-auditoria';
import { esUuid } from './uuid';

type Cliente = Pick<Prisma.TransactionClient, 'auditoriaSeguridad'>;

const aFila = (evento: EventoAuditoria): Prisma.AuditoriaSeguridadCreateManyInput => ({
  ocurrido_en: evento.ocurridoEn,
  accion: evento.accion,
  actor_usuario_id: evento.actorUsuarioId,
  afectado_usuario_id: evento.afectadoUsuarioId,
  objeto: evento.objeto,
  resultado: evento.resultado,
  origen_hmac: evento.origenHmac,
  detalle: evento.detalle as Prisma.InputJsonObject,
  evento_origen_id: evento.eventoOrigenId,
});

/**
 * Inserta eventos dentro de una transacción ya abierta (la del cambio que describen, research
 * §R-03). Un `evento_origen_id` repetido se ignora. Devuelve cuántos se insertaron.
 */
export const insertarEventosAuditoria = async (
  cliente: Cliente,
  eventos: readonly EventoAuditoria[],
): Promise<number> => {
  if (eventos.length === 0) {
    return 0;
  }
  const { count } = await cliente.auditoriaSeguridad.createMany({
    data: eventos.map(aFila),
    skipDuplicates: true,
  });
  return count;
};

interface FilaConsulta {
  readonly id: bigint;
  readonly ocurrido_en: Date;
  readonly accion: string;
  readonly actor_usuario_id: string | null;
  readonly actor_nombre: string | null;
  readonly afectado_usuario_id: string | null;
  readonly afectado_nombre: string | null;
  readonly objeto: string | null;
  readonly resultado: string;
}

/** Un usuario borrado (solo pasa en pruebas: a nadie se le borra) conserva su id en el historial. */
const NOMBRE_DESCONOCIDO = 'Usuario no encontrado';

const persona = (id: string | null, nombre: string | null) =>
  id === null ? null : { id, nombre: nombre ?? NOMBRE_DESCONOCIDO };

/** Adaptador de `seguridad.auditoria` (data-model.md §1). */
export class RepositorioAuditoriaPostgres implements RepositorioAuditoria {
  constructor(private readonly prisma: PrismaServicio) {}

  async registrar(evento: EventoAuditoria): Promise<boolean> {
    return (await insertarEventosAuditoria(this.prisma, [evento])) === 1;
  }

  async buscar(
    filtro: FiltroAuditoria,
    desplazamiento: number,
    cantidad: number,
  ): Promise<PaginaAuditoria> {
    const condiciones = [
      Prisma.sql`a.ocurrido_en >= ${filtro.desde}`,
      Prisma.sql`a.ocurrido_en < ${filtro.hasta}`,
    ];
    if (filtro.accion !== undefined) {
      condiciones.push(Prisma.sql`a.accion = ${filtro.accion}`);
    }
    if (filtro.actorId !== undefined) {
      if (!esUuid(filtro.actorId)) {
        return { filas: [], total: 0 };
      }
      condiciones.push(Prisma.sql`a.actor_usuario_id = ${filtro.actorId}::uuid`);
    }
    if (filtro.afectadoId !== undefined) {
      if (!esUuid(filtro.afectadoId)) {
        return { filas: [], total: 0 };
      }
      condiciones.push(Prisma.sql`a.afectado_usuario_id = ${filtro.afectadoId}::uuid`);
    }
    const donde = Prisma.join(condiciones, ' AND ');

    const [filas, conteo] = await this.prisma.$transaction([
      this.prisma.$queryRaw<FilaConsulta[]>`
        SELECT a.id, a.ocurrido_en, a.accion, a.objeto, a.resultado,
               a.actor_usuario_id, actor.nombre_completo AS actor_nombre,
               a.afectado_usuario_id, afectado.nombre_completo AS afectado_nombre
          FROM seguridad.auditoria a
          LEFT JOIN seguridad.usuario actor ON actor.id = a.actor_usuario_id
          LEFT JOIN seguridad.usuario afectado ON afectado.id = a.afectado_usuario_id
         WHERE ${donde}
         ORDER BY a.ocurrido_en DESC, a.id DESC
         LIMIT ${cantidad} OFFSET ${desplazamiento}`,
      this.prisma.$queryRaw<[{ total: bigint }]>`
        SELECT count(*) AS total FROM seguridad.auditoria a WHERE ${donde}`,
    ]);
    return {
      filas: filas.map((fila): FilaAuditoria => ({
        id: fila.id.toString(),
        ocurridoEn: fila.ocurrido_en,
        accion: fila.accion as AccionAuditoria,
        actor: persona(fila.actor_usuario_id, fila.actor_nombre),
        afectado: persona(fila.afectado_usuario_id, fila.afectado_nombre),
        objeto: fila.objeto,
        resultado: fila.resultado as ResultadoAuditoria,
      })),
      total: Number(conteo[0].total),
    };
  }

  async ultimoIngreso(usuarioId: string): Promise<Date | null> {
    if (!esUuid(usuarioId)) {
      return null;
    }
    const fila = await this.prisma.auditoriaSeguridad.findFirst({
      where: { afectado_usuario_id: usuarioId, accion: 'INGRESO_CORRECTO' },
      orderBy: [{ ocurrido_en: 'desc' }, { id: 'desc' }],
      select: { ocurrido_en: true },
    });
    return fila?.ocurrido_en ?? null;
  }

  contarIngresosFallidos(desde: Date): Promise<number> {
    return this.prisma.auditoriaSeguridad.count({
      where: { accion: { in: [...ACCIONES_INGRESO_FALLIDO] }, ocurrido_en: { gte: desde } },
    });
  }
}
