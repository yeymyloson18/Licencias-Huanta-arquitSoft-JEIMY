import type { AccionAuditoria } from './accion-auditoria';
import type { EntregaCodigo } from './evento-auditoria';

/** Cómo terminó un código del ingreso del personal (FR-006 de la 010). */
export type DesenlaceCodigo =
  'INGRESO_CORRECTO' | 'CODIGO_INCORRECTO' | 'BLOQUEO' | 'SIN_USAR' | 'PENDIENTE' | 'ENVIO_FALLIDO';

/** Un código vale 5 minutos (002); después, si no se usó, queda "sin usar". */
export const VIGENCIA_CODIGO_MS = 5 * 60 * 1000;

const TEXTOS: Readonly<Record<DesenlaceCodigo, string>> = {
  INGRESO_CORRECTO: 'Ingreso correcto',
  CODIGO_INCORRECTO: 'Código incorrecto',
  BLOQUEO: 'Bloqueo',
  SIN_USAR: 'Sin usar',
  PENDIENTE: 'Pendiente',
  ENVIO_FALLIDO: 'Envío fallido',
};

export const textoDesenlace = (desenlace: DesenlaceCodigo): string => TEXTOS[desenlace];

/**
 * Desenlace a partir de las acciones posteriores con el mismo intento (research §R-03 de la 010).
 * Gana el resultado más fuerte: un ingreso correcto después de un código incorrecto es "ingreso
 * correcto". Un código reemplazado por otro sigue "pendiente" hasta que vence.
 */
export const desenlaceDelCodigo = (datos: {
  readonly entrega: EntregaCodigo;
  readonly posteriores: readonly AccionAuditoria[];
  readonly enviadoEn: Date;
  readonly ahora: Date;
}): DesenlaceCodigo => {
  if (datos.entrega === 'FALLIDO') {
    return 'ENVIO_FALLIDO';
  }
  if (datos.posteriores.includes('INGRESO_CORRECTO')) {
    return 'INGRESO_CORRECTO';
  }
  if (
    datos.posteriores.includes('CUENTA_BLOQUEADA') ||
    datos.posteriores.includes('ORIGEN_BLOQUEADO')
  ) {
    return 'BLOQUEO';
  }
  if (datos.posteriores.includes('CODIGO_INCORRECTO')) {
    return 'CODIGO_INCORRECTO';
  }
  return datos.ahora.getTime() - datos.enviadoEn.getTime() >= VIGENCIA_CODIGO_MS
    ? 'SIN_USAR'
    : 'PENDIENTE';
};
