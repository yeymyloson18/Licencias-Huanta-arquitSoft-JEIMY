import type { CodigoOtp } from '../codigo-otp';

/** Persistencia de los códigos de inicio de sesión (`seguridad.codigo_otp`, propósito INICIO_SESION). */
export interface RepositorioCodigosOtp {
  crear(codigo: CodigoOtp): Promise<void>;
  /** Solo códigos de inicio de sesión; `null` si no existe o el id no es válido. */
  obtenerPorId(id: string): Promise<CodigoOtp | null>;
  /** Guarda los intentos, el vencimiento y si se usó. */
  guardar(codigo: CodigoOtp): Promise<void>;
  /** Vence los códigos vigentes del usuario: al pedir uno nuevo, solo vale el último (FR-002). */
  vencerVigentesDelUsuario(usuarioId: string, ahora: Date): Promise<void>;
}
