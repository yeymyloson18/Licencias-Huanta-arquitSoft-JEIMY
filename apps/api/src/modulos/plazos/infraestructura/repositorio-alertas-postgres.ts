import { deFechaBase, type Fecha } from '../../../compartido/dominio/fecha-lima';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { AlertaGuardada, RepositorioAlertas } from '../dominio/puertos';

interface FilaAlerta {
  readonly id: bigint;
  readonly numero_expediente: string;
  readonly vence_en: Date;
  readonly dias_habiles_restantes: number;
  readonly generada_en: Date;
  readonly atendida_en: Date | null;
  readonly atendida_por: string | null;
}

const aAlerta = (fila: FilaAlerta): AlertaGuardada => ({
  id: Number(fila.id),
  numeroExpediente: fila.numero_expediente,
  venceEn: deFechaBase(fila.vence_en),
  diasHabilesRestantes: fila.dias_habiles_restantes,
  generadaEn: fila.generada_en,
  atendidaEn: fila.atendida_en,
  atendidaPor: fila.atendida_por,
});

/** `plazos.alerta` (UNIQUE (numero_expediente, vence_en), EQ-07). */
export class RepositorioAlertasPostgres implements RepositorioAlertas {
  constructor(private readonly prisma: PrismaServicio) {}

  async insertarSiNoExiste(
    numeroExpediente: string,
    venceEn: Fecha,
    dias: number,
    en: Date,
  ): Promise<boolean> {
    const insertadas = await this.prisma.$executeRaw`
      INSERT INTO plazos.alerta (numero_expediente, vence_en, dias_habiles_restantes, generada_en)
      VALUES (${numeroExpediente}, ${venceEn}::date, ${dias}, ${en})
      ON CONFLICT (numero_expediente, vence_en) DO NOTHING`;
    return insertadas > 0;
  }

  async listar(soloPendientes: boolean): Promise<AlertaGuardada[]> {
    const filas = await this.prisma.alerta.findMany({
      where: soloPendientes ? { atendida_en: null } : {},
      orderBy: [{ vence_en: 'asc' }, { id: 'asc' }],
    });
    return filas.map(aAlerta);
  }

  async atender(
    id: number,
    usuarioId: string,
    en: Date,
  ): Promise<'ATENDIDA' | 'YA_ATENDIDA' | 'NO_EXISTE'> {
    const { count } = await this.prisma.alerta.updateMany({
      where: { id: BigInt(id), atendida_en: null },
      data: { atendida_en: en, atendida_por: usuarioId },
    });
    if (count > 0) {
      return 'ATENDIDA';
    }
    return (await this.obtener(id)) === null ? 'NO_EXISTE' : 'YA_ATENDIDA';
  }

  async obtener(id: number): Promise<AlertaGuardada | null> {
    const fila = await this.prisma.alerta.findUnique({ where: { id: BigInt(id) } });
    return fila === null ? null : aAlerta(fila);
  }
}
