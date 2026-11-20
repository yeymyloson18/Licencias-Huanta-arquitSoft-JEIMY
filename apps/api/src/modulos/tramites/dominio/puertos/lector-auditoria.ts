/** Un registro de `tramites.auditoria` (sin datos personales del titular). */
export interface RegistroAuditoriaTramites {
  readonly usuarioId: string | null;
  readonly accion: string;
  readonly numeroExpediente: string;
  readonly detalle: Readonly<Record<string, unknown>> | null;
  readonly ocurridoEn: Date;
}

/** Puerto: lectura de la auditoría de un expediente (RF25, historia 6 de la 005). */
export interface LectorAuditoria {
  existeExpediente(numero: string): Promise<boolean>;
  /** Del más antiguo al más reciente. */
  listar(numero: string): Promise<readonly RegistroAuditoriaTramites[]>;
}

/** Puerto: nombres del personal (adaptador de la fachada de Seguridad). */
export interface NombresPersonal {
  nombresDe(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
