import type { EmisorTokens } from '../dominio/puertos/emisor-tokens';
import type { Sesion } from '../dominio/sesion';
import type { Usuario } from '../dominio/usuario';

/** Lo que el controlador necesita para responder `SesionPersonal` y emitir la cookie. */
export interface SesionEmitida {
  readonly accessToken: string;
  readonly expiraEn: number;
  /** Va solo en la cookie `refresh_personal`, nunca en el cuerpo (research.md §R-05). */
  readonly refreshToken: string;
  readonly venceMaximoEn: Date;
  readonly usuario: Usuario;
}

/** Firma el token de acceso con el estado actual del usuario (roles, versión y clave temporal). */
export const emitirSesion = async (
  emisor: EmisorTokens,
  usuario: Usuario,
  sesion: Sesion,
  refreshToken: string,
): Promise<SesionEmitida> => ({
  accessToken: await emisor.firmarAcceso({
    sub: usuario.id,
    sid: sesion.id,
    roles: usuario.rolesVigentes,
    vs: usuario.versionSeguridad,
    dcc: usuario.debeCambiarClave,
  }),
  expiraEn: emisor.segundosDeVida,
  refreshToken,
  venceMaximoEn: sesion.venceMaximoEn,
  usuario,
});

/** Id de la sesión dentro del refresh token `<sesionId>.<secreto>`, o `null` si no tiene esa forma. */
export const sesionDelRefresh = (refreshToken: string): string | null => {
  const punto = refreshToken.indexOf('.');
  return punto > 0 && punto < refreshToken.length - 1 ? refreshToken.slice(0, punto) : null;
};
