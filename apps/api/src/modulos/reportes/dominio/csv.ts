import type { FilaReporte } from './puertos';

// CSV del reporte de licencias (FR-010 de la 007, aclaración del 2026-11-20): UTF-8 con BOM, separado
// por punto y coma y con fin de línea CRLF, para que Excel en español lo abra con tildes y eñes
// correctas. Los valores que empiezan como una fórmula llevan un apóstrofo delante (inyección CSV).

export const COLUMNAS_CSV = [
  'numero',
  'codigoReceta',
  'titular',
  'giro',
  'zona',
  'estado',
  'fecha',
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

/** El archivo completo: BOM, cabecera y una línea por fila. */
export const aCsv = (filas: readonly FilaReporte[]): string =>
  BOM +
  [
    COLUMNAS_CSV.join(';'),
    ...filas.map((fila) => COLUMNAS_CSV.map((columna) => celdaCsv(fila[columna])).join(';')),
  ].join(FIN_DE_LINEA) +
  FIN_DE_LINEA;

/** Compara giro y zona sin distinguir mayúsculas, tildes ni espacios repetidos. */
export const normalizarTexto = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es-PE')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Huella corta (FNV-1a de 64 bits, en hexadecimal) para la clave de caché de los filtros de texto
 * libre: deja la clave corta y sin caracteres raros. No es un dato secreto.
 */
export const huellaCorta = (texto: string): string => {
  let hash = 0xcbf29ce484222325n;
  for (const caracter of new TextEncoder().encode(texto)) {
    hash ^= BigInt(caracter);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
};
