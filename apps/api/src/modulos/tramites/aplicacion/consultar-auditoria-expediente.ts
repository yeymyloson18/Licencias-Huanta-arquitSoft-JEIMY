import type { LectorAuditoria, NombresPersonal } from '../dominio/puertos/lector-auditoria';
import { ErrorExpedienteNoEncontrado } from './errores';

/** Esquema `RegistroAuditoria` del contrato: referencia = número de expediente. */
export interface RegistroAuditoriaExpediente {
  readonly usuarioId: string | null;
  readonly nombreUsuario: string | null;
  readonly accion: string;
  readonly referencia: string;
  readonly detalle: Readonly<Record<string, unknown>> | null;
  readonly ocurridoEn: Date;
}

/**
 * `GET /expedientes/{n}/auditoria` (RF25, historia 6 de la 005): las decisiones registradas, del más
 * antiguo al más reciente, con el nombre del usuario del personal. Nunca datos del titular.
 */
export class ConsultarAuditoriaExpediente {
  constructor(
    private readonly d: { readonly lector: LectorAuditoria; readonly nombres: NombresPersonal },
  ) {}

  async ejecutar(numero: string): Promise<RegistroAuditoriaExpediente[]> {
    if (!(await this.d.lector.existeExpediente(numero))) {
      throw new ErrorExpedienteNoEncontrado();
    }
    const registros = await this.d.lector.listar(numero);
    const ids = registros.flatMap((r) => (r.usuarioId === null ? [] : [r.usuarioId]));
    const nombres = await this.d.nombres.nombresDe(ids);
    return registros.map((registro) => ({
      usuarioId: registro.usuarioId,
      nombreUsuario: registro.usuarioId === null ? null : (nombres.get(registro.usuarioId) ?? null),
      accion: registro.accion,
      referencia: registro.numeroExpediente,
      detalle: registro.detalle,
      ocurridoEn: registro.ocurridoEn,
    }));
  }
}
