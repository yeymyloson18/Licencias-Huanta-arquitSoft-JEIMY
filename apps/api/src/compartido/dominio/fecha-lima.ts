// Fechas de calendario (`AAAA-MM-DD`) en hora de Lima, sin horas ni zonas (006). Los plazos, las
// vigencias y los certificados se cuentan en días de Lima; Perú no tiene horario de verano (UTC-5).

/** Fecha de calendario `AAAA-MM-DD`. */
export type Fecha = string;

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const formateador = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** El día de Lima en que cae un instante. */
export const fechaLima = (instante: Date): Fecha => formateador.format(instante);

/** ¿Es una fecha de calendario real (por ejemplo, no 2026-02-30)? */
export const esFechaValida = (texto: string): boolean => {
  if (!FORMATO_FECHA.test(texto)) {
    return false;
  }
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(texto);
};

const aUtc = (fecha: Fecha): Date => new Date(`${fecha}T00:00:00Z`);
const deUtc = (fecha: Date): Fecha => fecha.toISOString().slice(0, 10);

/** Suma días de calendario (pueden ser negativos). */
export const sumarDias = (fecha: Fecha, dias: number): Fecha => {
  const resultado = aUtc(fecha);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return deUtc(resultado);
};

/** Suma meses; si el día no existe en el mes destino, queda el último día (31-ene + 1 mes = 28-feb). */
export const sumarMeses = (fecha: Fecha, meses: number): Fecha => {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const dia = Number(fecha.slice(8, 10));
  const indice = anio * 12 + (mes - 1) + meses;
  const anioDestino = Math.floor(indice / 12);
  const mesDestino = indice - anioDestino * 12;
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate();
  return deUtc(new Date(Date.UTC(anioDestino, mesDestino, Math.min(dia, ultimoDia))));
};

/** Día de la semana: 0 = domingo … 6 = sábado. */
export const diaDeLaSemana = (fecha: Fecha): number => aUtc(fecha).getUTCDay();

/** La fecha como instante a medianoche UTC (para columnas `date` de la base). */
export const comoFechaBase = (fecha: Fecha): Date => aUtc(fecha);

/** Una columna `date` de la base (medianoche UTC) como fecha de calendario. */
export const deFechaBase = (fecha: Date): Fecha => deUtc(fecha);

/** Instante en que empieza el día de Lima (00:00 de Lima = 05:00 UTC; Perú no cambia de hora). */
export const inicioDiaLima = (fecha: Fecha): Date => new Date(`${fecha}T05:00:00Z`);
