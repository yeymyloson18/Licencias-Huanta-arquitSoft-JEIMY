import type { EstadoInspeccion, Inspeccion, TipoInspeccion } from './inspeccion';

/** Puerto: la hora actual. */
export interface Reloj {
  ahora(): Date;
}

/** Puerto: ids aleatorios (claves de las fotos en el almacén). */
export interface GeneradorIds {
  nuevoId(): string;
}

export interface FotoGuardada {
  readonly clave: string;
  readonly tipoMime: 'image/jpeg' | 'image/png';
  readonly tamanoBytes: number;
}

export interface FiltroInspecciones {
  /** `null` = todas (jefatura); si no, solo las de ese inspector. */
  readonly inspectorId: string | null;
  readonly estado: EstadoInspeccion | null;
  readonly pagina: number;
  readonly porPagina: number;
}

/**
 * Puerto: `inspecciones.*`. `asignar` y `registrarResultado` son `UPDATE` condicionales (por estado e
 * inspector) que en la misma transacción escriben la auditoría y, al registrar, las fotos y el evento
 * `ResultadoITSERegistrado`. `false` si la inspección ya no estaba como se leyó.
 */
export interface RepositorioInspecciones {
  crearSiNoExiste(numeroExpediente: string, tipo: TipoInspeccion): Promise<boolean>;
  obtener(id: string): Promise<Inspeccion | null>;
  listar(filtro: FiltroInspecciones): Promise<{ total: number; datos: Inspeccion[] }>;
  asignar(inspeccion: Inspeccion, usuarioId: string, en: Date): Promise<boolean>;
  registrarResultado(
    inspeccion: Inspeccion,
    fotos: readonly FotoGuardada[],
    en: Date,
  ): Promise<boolean>;
}

/** Puerto: el personal (adaptador de la fachada de Seguridad). */
export interface PersonalInspecciones {
  inspectoresActivos(): Promise<readonly { readonly id: string; readonly nombre: string }[]>;
  nombresDe(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

/** Puerto: datos del expediente (adaptador de la fachada de Trámites). */
export interface ExpedientesInspecciones {
  resumenes(
    numeros: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly giro: string; readonly nombreLicencia: string }>>;
  /** Solo para el inspector asignado: la necesita para ir al local (research §R-14). */
  direccionDelLocal(numero: string): Promise<string | null>;
}
