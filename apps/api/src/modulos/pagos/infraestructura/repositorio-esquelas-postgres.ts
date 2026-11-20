import { Prisma } from '@prisma/client';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import type { Esquela } from '../dominio/esquela';
import type { RepositorioEsquelas } from '../dominio/puertos/repositorio-esquelas';

/** Adaptador de `pagos.esquela` (ADR-004: una esquela por expediente). */
export class RepositorioEsquelasPostgres implements RepositorioEsquelas {
  constructor(private readonly prisma: PrismaServicio) {}

  async crearSiNoExiste(esquela: Esquela): Promise<boolean> {
    const datos = esquela.aDatos();
    // ON CONFLICT DO NOTHING: si el evento se entrega dos veces, la segunda no duplica.
    const insertadas = await this.prisma.$executeRaw`
      INSERT INTO pagos.esquela (codigo, numero_expediente, codigo_receta, concepto, monto, generada_en)
      VALUES (${datos.codigo}, ${datos.numeroExpediente}, ${datos.codigoReceta}, ${datos.concepto},
              ${new Prisma.Decimal(datos.monto)}, ${datos.generadaEn})
      ON CONFLICT DO NOTHING`;
    return insertadas > 0;
  }
}
