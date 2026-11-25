import type { EstadoExpediente } from '../servicios/clienteApi';

// Nombre en pantalla de cada estado del expediente (004). Lo usan la bandeja, las fichas y
// InsigniaEstado (013).
export const ESTADOS: Readonly<Record<EstadoExpediente, string>> = {
  REGISTRADO: 'Registrado',
  OBSERVADO: 'Observado',
  EN_EVALUACION: 'En evaluación',
  PENDIENTE_PAGO: 'Pendiente de pago',
  PAGADO: 'Pagado',
  EN_INSPECCION: 'En inspección',
  APROBADO: 'Aprobado',
  LICENCIA_PROVISIONAL: 'Licencia provisional',
  LICENCIA_EMITIDA: 'Licencia emitida',
  ITSE_POSTERIOR_PENDIENTE: 'ITSE posterior pendiente',
  FINALIZADO: 'Finalizado',
  DENEGADO: 'Denegado',
  DERIVADO_A_FISCALIZACION: 'Derivado a fiscalización',
};
