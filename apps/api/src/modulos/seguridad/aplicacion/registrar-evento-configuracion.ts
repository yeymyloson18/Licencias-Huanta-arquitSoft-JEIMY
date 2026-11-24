import { eventoConfiguracion } from '../dominio/evento-auditoria';
import type { RepositorioAuditoria } from '../dominio/puertos/repositorio-auditoria';

export type AccionConfiguracion =
  | 'RECETA_ACTUALIZADA'
  | 'RECETA_DESACTIVADA'
  | 'RECETA_REACTIVADA'
  | 'FERIADO_REGISTRADO'
  | 'FERIADO_ELIMINADO';

export interface EntradaEventoConfiguracion {
  readonly accion: AccionConfiguracion;
  readonly usuarioId: string;
  /** Código de la receta o fecha del feriado. */
  readonly objeto: string;
  /** Hora del cambio en el módulo de origen (no la hora en que se consume el evento). */
  readonly en: Date;
  /** Id del evento en la cola: clave de idempotencia. */
  readonly eventoId: bigint;
}

/**
 * Lleva a la auditoría de seguridad un cambio de configuración publicado por Catálogo o Plazos
 * (research §R-02 de la 009). La entrega es "al menos una vez": un evento repetido no se duplica.
 * Devuelve `false` si ya estaba registrado.
 */
export class RegistrarEventoConfiguracion {
  constructor(private readonly auditoria: RepositorioAuditoria) {}

  ejecutar(entrada: EntradaEventoConfiguracion): Promise<boolean> {
    return this.auditoria.registrar(
      eventoConfiguracion({
        accion: entrada.accion,
        usuarioId: entrada.usuarioId,
        objeto: entrada.objeto,
        en: entrada.en,
        eventoOrigenId: entrada.eventoId,
      }),
    );
  }
}
