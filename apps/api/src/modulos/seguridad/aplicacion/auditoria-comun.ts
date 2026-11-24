import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';
import type { EventoAuditoria } from '../dominio/evento-auditoria';
import type { RegistroEventosSeguridad } from '../dominio/puertos/registro-eventos-seguridad';
import type { RepositorioAuditoria } from '../dominio/puertos/repositorio-auditoria';

const HMAC_SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Huella del origen de un intento (research §R-04 de la 009): HMAC-SHA256 de la IP con la clave de
 * datos, en hexadecimal. Permite agrupar intentos sin guardar la dirección. Si el protector no da
 * una huella de 32 bytes (solo pasa con dobles de prueba), no se guarda origen.
 */
export const huellaOrigen = (protector: ProtectorDatos, ip: string): string | null => {
  const hex = Buffer.from(protector.hmac(`origen:${ip}`)).toString('hex');
  return HMAC_SHA256_HEX.test(hex) ? hex : null;
};

/**
 * Registra un evento que no acompaña a ningún cambio (un intento fallido). Si la auditoría no se
 * puede guardar, se avisa sin datos y la operación responde igual: un 401 no se vuelve 500
 * (research §R-03 de la 009).
 */
export const registrarSinFallar = async (
  auditoria: RepositorioAuditoria,
  eventos: RegistroEventosSeguridad,
  evento: EventoAuditoria,
): Promise<void> => {
  try {
    await auditoria.registrar(evento);
  } catch {
    eventos.registrar('fallo-auditoria');
  }
};
