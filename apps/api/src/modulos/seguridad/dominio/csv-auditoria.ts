import { textoDesenlace } from './desenlace-codigo';
import { OBJETO_IDENTIDAD_ADMINISTRADO } from './evento-auditoria';
import { textoAccion, textoSinActor } from './accion-auditoria';
import type { FilaAuditoria } from './puertos/repositorio-auditoria';

// CSV de la auditoría de seguridad (FR-011 de la 009), con el mismo formato que el reporte de la 007:
// UTF-8 con BOM, separado por punto y coma y con fin de línea CRLF, para que Excel en español lo abra
// con tildes y eñes. Un valor que empieza como una fórmula lleva un apóstrofo delante (inyección CSV).

/** Como mucho estas filas por descarga, las más recientes (aclaración del 2026-11-23). */
export const MAXIMO_FILAS_CSV = 10_000;

export const COLUMNAS_CSV_AUDITORIA = [
  'fecha',
  'accion',
  'actor',
  'afectado',
  'objeto',
  'resultado',
  // 010: cómo terminó cada código enviado del personal; vacía en las demás acciones.
  'desenlace',
] as const;

const BOM = '﻿';
const FIN_DE_LINEA = '\r\n';
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;
const NECESITA_COMILLAS = /[;"\r\n]/;

/** Un valor listo para el CSV: sin fórmulas y entre comillas si hace falta. */
export const celdaCsv = (valor: string): string => {
  const seguro = INICIO_DE_FORMULA.test(valor) ? `'${valor}` : valor;
  return NECESITA_COMILLAS.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro;
};

// El formato sueco de fecha y hora es justamente `AAAA-MM-DD HH:MM:SS`.
const formateador = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** `AAAA-MM-DD HH:MM:SS` en hora de Lima. */
export const fechaHoraLima = (instante: Date): string => formateador.format(instante);

const RESULTADOS = { EXITO: 'Éxito', RECHAZADO: 'Rechazado' } as const;

const valores = (fila: FilaAuditoria): readonly string[] => [
  fechaHoraLima(fila.ocurridoEn),
  textoAccion(fila.accion),
  fila.actor?.nombre ?? textoSinActor(fila.accion),
  fila.afectado?.nombre ?? '',
  fila.objeto === OBJETO_IDENTIDAD_ADMINISTRADO
    ? 'Identidad del administrado'
    : (fila.objeto ?? ''),
  RESULTADOS[fila.resultado],
  fila.codigoEnviado?.desenlace ? textoDesenlace(fila.codigoEnviado.desenlace) : '',
];

/** El archivo completo: BOM, cabecera y una línea por fila. */
export const aCsvAuditoria = (filas: readonly FilaAuditoria[]): string =>
  BOM +
  [
    COLUMNAS_CSV_AUDITORIA.join(';'),
    ...filas.map((fila) => valores(fila).map(celdaCsv).join(';')),
  ].join(FIN_DE_LINEA) +
  FIN_DE_LINEA;
