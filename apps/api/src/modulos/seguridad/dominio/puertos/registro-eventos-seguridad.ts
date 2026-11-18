/** Eventos de seguridad que se registran para el monitoreo (research.md §R-17). */
export type EventoSeguridad =
  | 'inicio-sesion-exitoso'
  | 'inicio-sesion-fallido'
  | 'bloqueo-temporal'
  | 'reutilizacion-refresh'
  | 'usuario-desactivado'
  | 'roles-cambiados'
  | 'clave-temporal-asignada'
  | 'clave-cambiada'
  | 'fallo-cache-seguridad';

/** Identificadores internos permitidos en el registro: nunca datos personales. */
export interface IdsEvento {
  readonly usuarioId?: string;
  readonly sesionId?: string;
}

export interface RegistroEventosSeguridad {
  registrar(evento: EventoSeguridad, ids?: IdsEvento): void;
}
