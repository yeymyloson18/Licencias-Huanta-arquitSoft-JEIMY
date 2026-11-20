// Avisos al administrado (RF20, RF14, research §R-16 de la 006). Los datos del aviso nunca llevan
// documento, RUC, dirección ni enlaces con datos personales; el destinatario se guarda cifrado.

export type Canal = 'CORREO' | 'SMS';
export type Plantilla = 'CAMBIO_ESTADO' | 'ITSE_POR_VENCER';

export const MAXIMO_INTENTOS = 5;
const ESPERA_BASE_MS = 5_000;
const ESPERA_MAXIMA_MS = 10 * 60 * 1000;

export type DatosAviso =
  | {
      readonly plantilla: 'CAMBIO_ESTADO';
      readonly numeroExpediente: string;
      readonly estado: string;
      readonly descripcion: string;
      readonly siguientePaso: string;
    }
  | {
      readonly plantilla: 'ITSE_POR_VENCER';
      readonly numeroExpediente: string;
      readonly venceEn: string;
    };

/** Por correo si el titular lo dio; si no, por SMS al celular (FR-031). */
export const elegirCanal = (contacto: {
  readonly correo: string | null;
  readonly celular: string;
}): { readonly canal: Canal; readonly destino: string } =>
  contacto.correo !== null && contacto.correo.trim() !== ''
    ? { canal: 'CORREO', destino: contacto.correo.trim() }
    : { canal: 'SMS', destino: contacto.celular };

const fechaLarga = (fecha: string): string =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${fecha}T00:00:00Z`),
  );

/** Texto del aviso, corto y sin datos personales (FR-032). */
export const textoDelAviso = (datos: DatosAviso): string => {
  switch (datos.plantilla) {
    case 'CAMBIO_ESTADO':
      return `Municipalidad de Huanta. Expediente ${datos.numeroExpediente}: ${datos.descripcion}. Qué sigue: ${datos.siguientePaso}.`;
    case 'ITSE_POR_VENCER':
      return `Municipalidad de Huanta. El certificado ITSE del expediente ${datos.numeroExpediente} vence el ${fechaLarga(datos.venceEn)}. Renuévalo a tiempo.`;
  }
};

/**
 * Tras un fallo: cuándo reintentar (5 s × 2^intentos, como máximo 10 minutos) o `null` si ya se
 * agotaron los 5 intentos y el aviso queda FALLIDO (FR-033).
 */
export const siguienteIntento = (intentosHechos: number, ahora: Date): Date | null => {
  if (intentosHechos >= MAXIMO_INTENTOS) {
    return null;
  }
  const espera = Math.min(ESPERA_BASE_MS * 2 ** intentosHechos, ESPERA_MAXIMA_MS);
  return new Date(ahora.getTime() + espera);
};
