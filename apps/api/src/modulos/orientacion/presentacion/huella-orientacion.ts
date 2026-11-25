import type { ProtectorDatos } from '../../../compartido/dominio/protector-datos';

/**
 * Huella de la conexión para el límite del chat de orientación (012, research R-08): HMAC-SHA256 de
 * la IP con la clave de datos (la sal secreta), con el prefijo "orientacion:" para que sea distinta de
 * la huella de auditoría de la 009. Nunca se guarda la IP.
 */
export const huellaOrientacion = (protector: ProtectorDatos, ip: string): string =>
  Buffer.from(protector.hmac(`orientacion:${ip}`)).toString('hex');
