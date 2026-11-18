import { Logger } from '@nestjs/common';
import type {
  EventoSeguridad,
  IdsEvento,
  RegistroEventosSeguridad,
} from '../dominio/puertos/registro-eventos-seguridad';

const ADVERTENCIAS: ReadonlySet<EventoSeguridad> = new Set([
  'bloqueo-temporal',
  'reutilizacion-refresh',
  'fallo-cache-seguridad',
]);

/**
 * Registra eventos de seguridad con el logger de NestJS. Solo escribe el nombre del evento y los
 * identificadores internos: nunca correo, nombre, celular, clave, código, token ni IP (FR-029).
 */
export class RegistroEventosSeguridadLogger implements RegistroEventosSeguridad {
  private readonly registro = new Logger('Seguridad');

  registrar(evento: EventoSeguridad, ids: IdsEvento = {}): void {
    const partes = [`evento=${evento}`];
    if (ids.usuarioId !== undefined) {
      partes.push(`usuarioId=${ids.usuarioId}`);
    }
    if (ids.sesionId !== undefined) {
      partes.push(`sesionId=${ids.sesionId}`);
    }
    const linea = partes.join(' ');

    if (ADVERTENCIAS.has(evento)) {
      this.registro.warn(linea);
    } else {
      this.registro.log(linea);
    }
  }
}
