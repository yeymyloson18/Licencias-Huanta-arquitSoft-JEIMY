import { comoFechaBase, deFechaBase } from '../../../compartido/dominio/fecha-lima';
import type { PrismaServicio } from '../../../compartido/infraestructura/prisma.servicio';
import { esEstadoExpediente, type EstadoExpediente } from '../dominio/estado-publico';
import type {
  ExpedienteConPlazo,
  ExpedienteSinVencimiento,
  RepositorioVencimientos,
} from '../dominio/puertos/repositorio-vencimientos';
import type { PlazosHabiles } from '../dominio/puertos/plazos-habiles';
import type { FachadaPlazos } from '../../plazos/fachada';

/** Plazo de los expedientes en PostgreSQL (índice `ix_expediente_estado (estado, vence_plazo_en)`). */
export class RepositorioVencimientosPostgres implements RepositorioVencimientos {
  constructor(private readonly prisma: PrismaServicio) {}

  async sinVencimiento(estados: readonly EstadoExpediente[]): Promise<ExpedienteSinVencimiento[]> {
    const filas = await this.prisma.expediente.findMany({
      where: { estado: { in: [...estados] }, vence_plazo_en: null, plazo_restante_dias: null },
      select: { id: true, estado: true, presentado_en: true, receta_al_presentar: true },
    });
    return filas.flatMap((fila) => {
      const receta = fila.receta_al_presentar as { plazoDias?: unknown } | null;
      const plazoDias = typeof receta?.plazoDias === 'number' ? receta.plazoDias : 0;
      // Sin plazo en la receta: sin vencimiento (y sin alertas).
      return plazoDias > 0 && esEstadoExpediente(fila.estado)
        ? [{ id: fila.id, estado: fila.estado, presentadoEn: fila.presentado_en, plazoDias }]
        : [];
    });
  }

  async fijar(
    id: string,
    plazo: { readonly vencePlazoEn: string | null; readonly plazoRestanteDias: number | null },
  ): Promise<void> {
    await this.prisma.expediente.updateMany({
      where: { id, vence_plazo_en: null, plazo_restante_dias: null },
      data: {
        vence_plazo_en: plazo.vencePlazoEn === null ? null : comoFechaBase(plazo.vencePlazoEn),
        plazo_restante_dias: plazo.plazoRestanteDias,
      },
    });
  }

  async conPlazo(estados: readonly EstadoExpediente[]): Promise<ExpedienteConPlazo[]> {
    const filas = await this.prisma.expediente.findMany({
      where: { estado: { in: [...estados] }, vence_plazo_en: { not: null } },
      select: { numero: true, estado: true, vence_plazo_en: true },
    });
    return filas.flatMap((fila) =>
      fila.vence_plazo_en !== null && esEstadoExpediente(fila.estado)
        ? [
            {
              numero: fila.numero,
              estado: fila.estado,
              vencePlazoEn: deFechaBase(fila.vence_plazo_en),
            },
          ]
        : [],
    );
  }
}

/** Adaptador de `PlazosHabiles` sobre la fachada de Plazos (principio I). */
export class PlazosFachada implements PlazosHabiles {
  constructor(private readonly plazos: FachadaPlazos) {}

  sumarDiasHabiles(desde: string, dias: number): Promise<string> {
    return this.plazos.sumarDiasHabiles(desde, dias);
  }

  diasHabilesRestantes(hoy: string, vence: string): Promise<number> {
    return this.plazos.diasHabilesRestantes(hoy, vence);
  }
}
