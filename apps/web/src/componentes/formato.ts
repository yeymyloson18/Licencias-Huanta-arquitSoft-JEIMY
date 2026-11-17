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
