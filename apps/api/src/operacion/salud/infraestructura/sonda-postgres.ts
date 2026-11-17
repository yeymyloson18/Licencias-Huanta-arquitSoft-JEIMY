import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { SondaDependencia } from '../dominio/sonda-dependencia';

/** Adaptador: PostgreSQL responde si ejecuta `SELECT 1`. */
export class SondaPostgres implements SondaDependencia {
  constructor(private readonly prisma: PrismaServicio) {}

  async comprobar(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
