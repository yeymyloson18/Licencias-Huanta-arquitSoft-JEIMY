import type { PlazosHabiles } from '../dominio/puertos/plazos-habiles';

/** Plazo para subsanar: 2 días hábiles (TUO de la Ley N.° 27444, 136.2; research §R-05 de la 006). */
export const DIAS_PARA_SUBSANAR = 2;

export interface CambioPlazo {
  readonly vencePlazoEn?: string | null;
  readonly plazoRestanteDias?: number | null;
}

/**
 * Suspende el plazo (OBSERVADO o PENDIENTE_PAGO, research §R-04 de la 006): guarda los días hábiles
 * que quedaban (0 si ya había vencido) y deja el vencimiento vacío. Sin vencimiento, no cambia nada.
 */
export const suspenderPlazo = async (
  plazos: PlazosHabiles | undefined,
  vencePlazoEn: string | null | undefined,
  hoy: string,
): Promise<CambioPlazo> => {
  if (plazos === undefined || vencePlazoEn === null || vencePlazoEn === undefined) {
    return {};
  }
  const restantes = await plazos.diasHabilesRestantes(hoy, vencePlazoEn);
  return { vencePlazoEn: null, plazoRestanteDias: Math.max(0, restantes) };
};

/** Reanuda el plazo suspendido: vence tantos días hábiles después de hoy como quedaban. */
export const reanudarPlazo = async (
  plazos: PlazosHabiles | undefined,
  plazoRestanteDias: number | null | undefined,
  hoy: string,
): Promise<CambioPlazo> => {
  if (plazos === undefined || plazoRestanteDias === null || plazoRestanteDias === undefined) {
    return {};
  }
  return {
    vencePlazoEn: await plazos.sumarDiasHabiles(hoy, plazoRestanteDias),
    plazoRestanteDias: null,
  };
};
