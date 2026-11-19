// Estado del expediente en lenguaje sencillo (FR-021 y FR-030 de la 004,
// contracts/consulta-y-bandeja.md). Es un dato del dominio: cada estado tiene su texto, aunque la
// mayoría se alcanza en funcionalidades posteriores; una prueba comprueba que ninguno queda sin texto.

export const ESTADOS_EXPEDIENTE = [
  'REGISTRADO',
  'OBSERVADO',
  'EN_EVALUACION',
  'PENDIENTE_PAGO',
  'PAGADO',
  'EN_INSPECCION',
  'APROBADO',
  'LICENCIA_PROVISIONAL',
  'LICENCIA_EMITIDA',
  'ITSE_POSTERIOR_PENDIENTE',
  'FINALIZADO',
  'DENEGADO',
  'DERIVADO_A_FISCALIZACION',
] as const;

export type EstadoExpediente = (typeof ESTADOS_EXPEDIENTE)[number];

export interface TextoEstado {
  readonly descripcion: string;
  readonly siguientePaso: string;
}

export const TEXTO_ESTADO_PUBLICO: Readonly<Record<EstadoExpediente, TextoEstado>> = {
  REGISTRADO: {
    descripcion: 'Tu solicitud fue registrada y espera evaluación',
    siguientePaso: 'La municipalidad revisará tus documentos y confirmará el nivel de riesgo',
  },
  OBSERVADO: {
    descripcion: 'Tu solicitud tiene observaciones',
    siguientePaso: 'Subsana las observaciones dentro del plazo indicado',
  },
  EN_EVALUACION: {
    descripcion: 'Tu solicitud está en evaluación',
    siguientePaso: 'La municipalidad está revisando tus documentos',
  },
  PENDIENTE_PAGO: {
    descripcion: 'Tu esquela de pago está lista',
    siguientePaso: 'Paga la esquela en la caja municipal',
  },
  PAGADO: {
    descripcion: 'Tu pago fue registrado',
    siguientePaso: 'La municipalidad continuará con tu trámite',
  },
  EN_INSPECCION: {
    descripcion: 'Tu establecimiento está en inspección',
    siguientePaso: 'Espera la visita del inspector ITSE',
  },
  APROBADO: {
    descripcion: 'Tu solicitud fue aprobada',
    siguientePaso: 'La municipalidad emitirá tu licencia',
  },
  LICENCIA_PROVISIONAL: {
    descripcion: 'Tienes una licencia provisional',
    siguientePaso: 'Descarga tu licencia provisional',
  },
  LICENCIA_EMITIDA: {
    descripcion: 'Tu licencia fue emitida',
    siguientePaso: 'Descarga tu licencia',
  },
  ITSE_POSTERIOR_PENDIENTE: {
    descripcion: 'Tu licencia fue emitida y falta la inspección ITSE posterior',
    siguientePaso: 'Espera la visita del inspector ITSE',
  },
  FINALIZADO: {
    descripcion: 'Tu trámite terminó',
    siguientePaso: 'No necesitas hacer nada más',
  },
  DENEGADO: {
    descripcion: 'Tu solicitud fue denegada',
    siguientePaso: 'Acércate a la municipalidad para conocer el motivo',
  },
  DERIVADO_A_FISCALIZACION: {
    descripcion: 'Tu trámite fue derivado a fiscalización',
    siguientePaso: 'Acércate a la municipalidad para más información',
  },
};

export const esEstadoExpediente = (valor: unknown): valor is EstadoExpediente =>
  (ESTADOS_EXPEDIENTE as readonly unknown[]).includes(valor);
