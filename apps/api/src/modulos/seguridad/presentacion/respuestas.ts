import type { SesionEmitida } from '../aplicacion/emitir-sesion';
import type { Usuario } from '../dominio/usuario';

/** Esquema `Usuario` del contrato. El celular nunca se devuelve completo (FR-028). */
export interface UsuarioRespuesta {
  readonly id: string;
  readonly correo: string;
  readonly nombreCompleto: string;
  readonly celularEnmascarado: string;
  readonly roles: string[];
  readonly activo: boolean;
  readonly debeCambiarClave: boolean;
}

/** Esquema `SesionPersonal` del contrato: sin refresh token (va en la cookie). */
export interface SesionPersonalRespuesta {
  readonly accessToken: string;
  readonly expiraEn: number;
  readonly debeCambiarClave: boolean;
  readonly usuario: UsuarioRespuesta;
}

export const aUsuarioRespuesta = (usuario: Usuario): UsuarioRespuesta => ({
  id: usuario.id,
  correo: usuario.correo.valor,
  nombreCompleto: usuario.nombreCompleto.valor,
  celularEnmascarado: usuario.celular.enmascarado(),
  roles: usuario.rolesVigentes,
  activo: usuario.activo,
  debeCambiarClave: usuario.debeCambiarClave,
});

export const aSesionPersonal = (sesion: SesionEmitida): SesionPersonalRespuesta => ({
  accessToken: sesion.accessToken,
  expiraEn: sesion.expiraEn,
  debeCambiarClave: sesion.usuario.debeCambiarClave,
  usuario: aUsuarioRespuesta(sesion.usuario),
});
