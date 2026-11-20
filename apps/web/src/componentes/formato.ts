const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

/** "159.50" (texto del contrato) → "S/ 159.50". */
export const formatearTasa = (tasa: string): string => soles.format(Number(tasa));

/** 2 → "2 días hábiles"; 1 → "1 día hábil"; sin plazo → "Plazo no aplica". */
export const formatearPlazo = (dias: number | null | undefined): string => {
  if (dias === null || dias === undefined) {
    return 'Plazo no aplica';
  }
  return dias === 1 ? '1 día hábil' : `${String(dias)} días hábiles`;
};

// --- Ficha de la licencia (contracts/portal-catalogo.md de la 003) ---
// Estos textos traducen enumeraciones del contrato; los montos, plazos y requisitos vienen siempre
// de la API (FR-012).

/** "0.00" → "Gratuito"; otro monto → "S/ 159.50". */
export const formatearTasaFicha = (tasa: string): string =>
  Number(tasa) === 0 ? 'Gratuito' : formatearTasa(tasa);

/** Plazo con su tipo de días: "2 días hábiles", "1 día calendario"; `null` si no tiene plazo. */
export const formatearPlazoConTipo = (
  dias: number | null | undefined,
  tipo: 'HABILES' | 'CALENDARIO' | undefined,
): string | null => {
  if (dias === null || dias === undefined) {
    return null;
  }
  if (tipo === 'CALENDARIO') {
    return dias === 1 ? '1 día calendario' : `${String(dias)} días calendario`;
  }
  return formatearPlazo(dias);
};

const CALIFICACIONES = {
  APROBACION_AUTOMATICA: 'Aprobación automática',
  EVALUACION_PREVIA_SILENCIO_POSITIVO: 'Evaluación previa con silencio positivo',
  SERVICIO_EXCLUSIVO: 'Servicio prestado en exclusividad',
} as const;

export const formatearCalificacion = (calificacion: keyof typeof CALIFICACIONES): string =>
  CALIFICACIONES[calificacion];

/** Cuándo es la inspección ITSE; `null` si la receta no tiene ITSE. */
export const formatearItse = (
  orden: 'POSTERIOR' | 'PREVIA' | 'DENTRO_6_MESES' | null | undefined,
  plazoDias: number | null | undefined,
): string | null => {
  if (orden === null || orden === undefined) {
    return null;
  }
  if (orden === 'DENTRO_6_MESES') {
    return 'Se notifica dentro de 6 meses';
  }
  const momento = orden === 'POSTERIOR' ? 'Posterior' : 'Previa';
  return plazoDias === null || plazoDias === undefined
    ? momento
    : `${momento}, hasta ${formatearPlazo(plazoDias)}`;
};

/** Vigencia de una licencia; `null` en los trámites conectados (no aplica). */
export const formatearVigencia = (
  meses: number | null | undefined,
  tipo: 'LICENCIA' | 'TRAMITE_CONECTADO',
  ruta: 'A' | 'B' | 'C' | null | undefined,
): string | null => {
  if (tipo === 'TRAMITE_CONECTADO') {
    return null;
  }
  if (meses === null || meses === undefined) {
    return 'Indeterminada';
  }
  const duracion = meses === 1 ? '1 mes' : `${String(meses)} meses`;
  return ruta === 'C' ? `Provisional de ${duracion}` : duracion;
};

const CONDICIONES = {
  SIEMPRE: null,
  CON_REPRESENTANTE: 'Solo si actúa un representante',
  GIRO_ESPECIAL: 'Solo si tu giro lo exige',
  SIN_PLANOS_VIGENTES:
    'No se pide si presentaste planos en los últimos 5 años y la edificación no cambió',
} as const;

/** Etiqueta de un requisito condicional; `null` si se pide siempre. */
export const etiquetaCondicion = (condicion: keyof typeof CONDICIONES): string | null =>
  CONDICIONES[condicion];

/** Una frase para mostrar como oración: termina en punto si no trae ya un signo final. */
export const conPuntoFinal = (frase: string): string => {
  const texto = frase.trim();
  return texto === '' || /[.!?…]$/.test(texto) ? texto : `${texto}.`;
};
