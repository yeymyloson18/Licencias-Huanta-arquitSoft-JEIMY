import type { Canal, DatosAviso } from './aviso';

/** Puerto: la hora actual. */
export interface Reloj {
  ahora(): Date;
}

/** Puerto: envío por correo o SMS (en desarrollo, simulado; research §R-16). */
export interface EnviadorMensajes {
  enviar(mensaje: {
    readonly id: string;
    readonly canal: Canal;
    readonly destino: string;
    readonly texto: string;
  }): Promise<void>;
}

/** Puerto: datos del expediente para el aviso (adaptador de la fachada de Trámites). */
export interface ExpedientesAvisos {
  contactoTitular(
    numero: string,
  ): Promise<{ readonly correo: string | null; readonly celular: string } | null>;
  textoDeEstado(
    estado: string,
  ): { readonly descripcion: string; readonly siguientePaso: string } | null;
}

export interface AvisoPorEnviar {
  readonly id: string;
  readonly canal: Canal;
  /** Ya descifrado, solo para enviarlo. */
  readonly destino: string;
  readonly datos: DatosAviso;
  readonly intentos: number;
}

/**
 * Puerto: `notificaciones.mensaje`. `crearSiNoExiste` usa `evento_id` UNIQUE (un aviso por evento).
 * `tomarPendientes` reserva los avisos (para que dos réplicas no envíen el mismo).
 */
export interface RepositorioAvisos {
  crearSiNoExiste(aviso: {
    readonly eventoId: bigint;
    readonly canal: Canal;
    readonly destino: string;
    readonly datos: DatosAviso;
    readonly en: Date;
  }): Promise<boolean>;
  tomarPendientes(limite: number, ahora: Date): Promise<AvisoPorEnviar[]>;
  marcarEnviado(id: string, en: Date): Promise<void>;
  marcarFallo(
    id: string,
    intentos: number,
    nombreError: string,
    reintentarEn: Date | null,
  ): Promise<void>;
}
