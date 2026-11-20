import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { esEstadoExpediente } from '../dominio/estado-publico';
import type { ExpedienteParaCaja, LectorParaCaja } from '../dominio/puertos/lector-para-caja';

/** Lee solo columnas sin cifrar (el nombre del titular no está cifrado; el documento sí). */
export class LectorParaCajaPostgres implements LectorParaCaja {
  constructor(private readonly prisma: PrismaServicio) {}

  async obtener(numero: string): Promise<ExpedienteParaCaja | null> {
    const fila = await this.prisma.expediente.findUnique({
      where: { numero },
      select: { numero: true, estado: true, nombre_titular: true, razon_social: true },
    });
    if (fila === null || !esEstadoExpediente(fila.estado)) {
      return null;
    }
    return {
      numero: fila.numero,
      estado: fila.estado,
      nombreTitular: fila.nombre_titular,
      razonSocial: fila.razon_social,
    };
  }
}
