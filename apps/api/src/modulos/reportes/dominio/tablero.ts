import type { CalendarioHabil } from '../../../compartido/dominio/calendario-habil';
import type { Fecha } from '../../../compartido/dominio/fecha-lima';
import type { RangoFechas } from './rango-fechas';

// Cálculos del tablero de la jefatura (HU10, RF19; research §R-01 y §R-02 de la 007). Puros: los datos
// llegan de las fachadas y el calendario de días hábiles llega construido.

/** Atención de un expediente: de la presentación a la primera decisión final, en días de Lima. */
export interface Atencion {
  readonly codigoReceta: string;
  readonly presentadoEn: Fecha;
  readonly terminadoEn: Fecha;
  readonly suspensiones: readonly { readonly desde: Fecha; readonly hasta: Fecha }[];
}

export interface PagoEnCaja {
  readonly codigoReceta: string;
  readonly monto: string;
}

export interface PlazoDeReceta {
  readonly codigoReceta: string;
  readonly plazoDias: number | null;
}

export interface TiempoPorReceta {
  readonly codigoReceta: string;
  readonly plazoTupaDias: number;
  readonly atendidos: number;
  readonly promedioDiasHabiles: number | null;
  readonly dentroDelPlazo: number | null;
}

export interface Tablero {
  readonly desde: Fecha;
  readonly hasta: Fecha;
  readonly generadoEn: string;
  readonly expedientesPorEstado: Readonly<Record<string, number>>;
  readonly tiempoPromedioPorReceta: readonly TiempoPorReceta[];
  readonly ingresos: {
    readonly total: string;
    readonly porReceta: Readonly<Record<string, string>>;
  };
}

/** El monto no tiene el formato de soles con 2 decimales. */
export class ErrorMontoInvalido extends Error {
  constructor() {
    super('Monto con formato inválido');
    this.name = 'ErrorMontoInvalido';
  }
}

const FORMATO_SOLES = /^(\d{1,8})\.(\d{2})$/;

/** `"177.10"` → 17710n. Sumar en céntimos enteros evita errores de redondeo (research §R-02). */
export const centimosDe = (soles: string): bigint => {
  const partes = FORMATO_SOLES.exec(soles);
  if (partes === null) {
    throw new ErrorMontoInvalido();
  }
  return BigInt(partes[1] ?? '0') * 100n + BigInt(partes[2] ?? '0');
};

/** 17710n → `"177.10"`. */
export const solesDe = (centimos: bigint): string =>
  `${String(centimos / 100n)}.${String(centimos % 100n).padStart(2, '0')}`;

const unDecimal = (valor: number): number => Math.round(valor * 10) / 10;

/**
 * Días hábiles de atención: de la presentación a la decisión, sin contar los días con el plazo
 * suspendido (cada suspensión recortada a la atención). Nunca negativo.
 */
export const diasDeAtencion = (atencion: Atencion, calendario: CalendarioHabil): number => {
  const total = calendario.diasHabilesRestantes(atencion.presentadoEn, atencion.terminadoEn);
  const suspendidos = atencion.suspensiones.reduce((suma, suspension) => {
    const desde =
      suspension.desde < atencion.presentadoEn ? atencion.presentadoEn : suspension.desde;
    const hasta = suspension.hasta > atencion.terminadoEn ? atencion.terminadoEn : suspension.hasta;
    return desde < hasta ? suma + calendario.diasHabilesRestantes(desde, hasta) : suma;
  }, 0);
  return Math.max(0, total - suspendidos);
};

/** Tiempo de atención por receta frente al plazo del TUPA (FR-003). */
export const tiemposPorReceta = (
  atenciones: readonly Atencion[],
  plazos: readonly PlazoDeReceta[],
  calendario: CalendarioHabil,
): TiempoPorReceta[] => {
  const dias = new Map<string, number[]>();
  for (const atencion of atenciones) {
    const lista = dias.get(atencion.codigoReceta) ?? [];
    lista.push(diasDeAtencion(atencion, calendario));
    dias.set(atencion.codigoReceta, lista);
  }
  const plazoDe = new Map(plazos.map((plazo) => [plazo.codigoReceta, plazo.plazoDias ?? 0]));
  const codigos = [...new Set([...plazoDe.keys(), ...dias.keys()])].sort();
  return codigos.map((codigoReceta) => {
    const plazo = plazoDe.get(codigoReceta) ?? 0;
    const lista = dias.get(codigoReceta) ?? [];
    if (lista.length === 0) {
      return {
        codigoReceta,
        plazoTupaDias: plazo,
        atendidos: 0,
        promedioDiasHabiles: null,
        dentroDelPlazo: null,
      };
    }
    const suma = lista.reduce((a, b) => a + b, 0);
    const dentro = lista.filter((valor) => valor <= plazo).length;
    return {
      codigoReceta,
      plazoTupaDias: plazo,
      atendidos: lista.length,
      promedioDiasHabiles: unDecimal(suma / lista.length),
      dentroDelPlazo: plazo === 0 ? null : unDecimal((dentro * 100) / lista.length),
    };
  });
};

/** Ingresos en caja: total y por receta, exactos al céntimo (FR-004). */
export const ingresosDe = (
  pagos: readonly PagoEnCaja[],
): { readonly total: string; readonly porReceta: Readonly<Record<string, string>> } => {
  const porReceta = new Map<string, bigint>();
  let total = 0n;
  for (const pago of pagos) {
    const centimos = centimosDe(pago.monto);
    total += centimos;
    porReceta.set(pago.codigoReceta, (porReceta.get(pago.codigoReceta) ?? 0n) + centimos);
  }
  return {
    total: solesDe(total),
    porReceta: Object.fromEntries(
      [...porReceta.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([c, v]) => [c, solesDe(v)]),
    ),
  };
};

/** Arma el tablero completo. */
export const calcularTablero = (datos: {
  readonly rango: RangoFechas;
  readonly generadoEn: Date;
  readonly conteoPorEstado: Readonly<Record<string, number>>;
  readonly atenciones: readonly Atencion[];
  readonly plazos: readonly PlazoDeReceta[];
  readonly pagos: readonly PagoEnCaja[];
  readonly calendario: CalendarioHabil;
}): Tablero => ({
  desde: datos.rango.desde,
  hasta: datos.rango.hasta,
  generadoEn: datos.generadoEn.toISOString(),
  expedientesPorEstado: datos.conteoPorEstado,
  tiempoPromedioPorReceta: tiemposPorReceta(datos.atenciones, datos.plazos, datos.calendario),
  ingresos: ingresosDe(datos.pagos),
});
