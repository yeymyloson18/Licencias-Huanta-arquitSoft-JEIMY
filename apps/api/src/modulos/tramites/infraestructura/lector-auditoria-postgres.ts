import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { FachadaSeguridad } from '../../seguridad/fachada';
import type {
  LectorAuditoria,
  NombresPersonal,
  RegistroAuditoriaTramites,
} from '../dominio/puertos/lector-auditoria';

/** `tramites.auditoria` por número de expediente (índice `ix_auditoria_tramites`). */
export class LectorAuditoriaPostgres implements LectorAuditoria {
  constructor(private readonly prisma: PrismaServicio) {}

  async existeExpediente(numero: string): Promise<boolean> {
    return (await this.prisma.expediente.count({ where: { numero } })) > 0;
  }

  async listar(numero: string): Promise<readonly RegistroAuditoriaTramites[]> {
    const filas = await this.prisma.auditoriaTramites.findMany({
      where: { numero_expediente: numero },
      orderBy: [{ ocurrido_en: 'asc' }, { id: 'asc' }],
    });
    return filas.map((fila) => ({
      usuarioId: fila.usuario_id,
      accion: fila.accion,
      numeroExpediente: fila.numero_expediente,
      detalle:
        fila.detalle !== null && typeof fila.detalle === 'object' && !Array.isArray(fila.detalle)
          ? (fila.detalle as Record<string, unknown>)
          : null,
      ocurridoEn: fila.ocurrido_en,
    }));
  }
}

/** Adaptador de `NombresPersonal` sobre la fachada de Seguridad (principio I). */
export class NombresPersonalFachada implements NombresPersonal {
  constructor(private readonly seguridad: FachadaSeguridad) {}

  nombresDe(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.seguridad.nombresDeUsuarios(ids);
  }
}
