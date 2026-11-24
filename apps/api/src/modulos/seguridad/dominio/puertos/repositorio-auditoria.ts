import type { AccionAuditoria } from '../accion-auditoria';
import type { DesenlaceCodigo } from '../desenlace-codigo';
import type {
  CanalCodigo,
  EntregaCodigo,
  EventoAuditoria,
  PropositoCodigo,
  ResultadoAuditoria,
} from '../evento-auditoria';

/** Filtro de la consulta (research §R-08). `hasta` es exclusivo; los ids son internos. */
export interface FiltroAuditoria {
  readonly desde: Date;
  readonly hasta: Date;
  readonly accion?: AccionAuditoria;
  readonly actorId?: string;
  readonly afectadoId?: string;
}

export interface PersonaAuditoria {
  readonly id: string;
  readonly nombre: string;
}

/** Lo visible de un `CODIGO_ENVIADO` (010): nunca el código ni el identificador del intento. */
export interface CodigoEnviadoVista {
  readonly proposito: PropositoCodigo;
  readonly canal: CanalCodigo;
  readonly destino: string;
  readonly entrega: EntregaCodigo;
  /** Resultado del intento en el ingreso del personal; `null` en la identidad del administrado. */
  readonly desenlace: DesenlaceCodigo | null;
}

/** Códigos enviados desde un instante (panel, 010). */
export interface ResumenCodigos {
  readonly entregados: number;
  /** Entregados que terminaron en un ingreso correcto. */
  readonly conIngreso: number;
  readonly fallidos: number;
}

/** Una fila lista para mostrar: con nombres, sin `detalle` ni `origen_hmac`. */
export interface FilaAuditoria {
  readonly id: string;
  readonly ocurridoEn: Date;
  readonly accion: AccionAuditoria;
  readonly actor: PersonaAuditoria | null;
  readonly afectado: PersonaAuditoria | null;
  readonly objeto: string | null;
  readonly resultado: ResultadoAuditoria;
  /** Solo en `CODIGO_ENVIADO` (010); `null` en las demás acciones. */
  readonly codigoEnviado: CodigoEnviadoVista | null;
}

export interface PaginaAuditoria {
  readonly filas: readonly FilaAuditoria[];
  readonly total: number;
}

/**
 * Auditoría de seguridad (`seguridad.auditoria`, solo de agregar). Los eventos que acompañan a un
 * cambio se guardan en la transacción de ese cambio, por los otros repositorios (research §R-03);
 * este puerto guarda los que no cambian nada más (intentos fallidos, eventos de la cola) y consulta.
 */
export interface RepositorioAuditoria {
  /**
   * Agrega el evento. Si trae `eventoOrigenId` y ya estaba registrado, no hace nada y devuelve
   * `false` (consumo idempotente de la cola, research §R-02).
   */
  registrar(evento: EventoAuditoria): Promise<boolean>;
  /** Eventos del filtro, del más reciente al más antiguo, desde `desplazamiento`. */
  buscar(
    filtro: FiltroAuditoria,
    desplazamiento: number,
    cantidad: number,
  ): Promise<PaginaAuditoria>;
  /** Fecha del último `INGRESO_CORRECTO` del usuario, o `null`. */
  ultimoIngreso(usuarioId: string): Promise<Date | null>;
  /** Intentos de ingreso fallidos desde ese instante (research §R-06). */
  contarIngresosFallidos(desde: Date): Promise<number>;
  /** Códigos enviados desde ese instante: entregados, con ingreso correcto y fallidos (010). */
  resumenCodigos(desde: Date): Promise<ResumenCodigos>;
}
