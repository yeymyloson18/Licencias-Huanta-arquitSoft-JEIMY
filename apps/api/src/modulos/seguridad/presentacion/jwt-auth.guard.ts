import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import type { EmisorTokens } from '../dominio/puertos/emisor-tokens';
import type { Rol } from '../dominio/rol';
import { EMISOR_TOKENS } from '../tokens';
import { METADATO_PERMITIR_CLAVE_TEMPORAL } from './decoradores';

/** Usuario autenticado que el guard deja en la petición. Sin datos personales (principio VII). */
export interface UsuarioAutenticado {
  readonly usuarioId: string;
  readonly sesionId: string;
  readonly roles: readonly Rol[];
  readonly versionSeguridad: number;
  readonly debeCambiarClave: boolean;
}

export interface PeticionAutenticada {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  usuarioAutenticado?: UsuarioAutenticado;
}

const PREFIJO = 'Bearer ';

/**
 * Exige un token de acceso válido (401 `no-autenticado`) y, si el usuario tiene clave temporal,
 * solo deja pasar las operaciones marcadas con `@PermitirConClaveTemporal()` (403
 * `debe-cambiar-clave`, FR-022). La versión de seguridad y las sesiones revocadas se comprueban a
 * partir de US2 (research.md §R-07).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(EMISOR_TOKENS) private readonly emisor: EmisorTokens,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionAutenticada>();
    const token = this.extraerToken(peticion);
    const reclamos = token === null ? null : await this.emisor.verificarAcceso(token);
    if (reclamos === null) {
      throw ErrorProblema.noAutenticado();
    }

    const usuario: UsuarioAutenticado = {
      usuarioId: reclamos.sub,
      sesionId: reclamos.sid,
      roles: reclamos.roles,
      versionSeguridad: reclamos.vs,
      debeCambiarClave: reclamos.dcc,
    };

    if (usuario.debeCambiarClave && !this.permiteClaveTemporal(contexto)) {
      throw ErrorProblema.debeCambiarClave();
    }

    peticion.usuarioAutenticado = usuario;
    return true;
  }

  private extraerToken(peticion: PeticionAutenticada): string | null {
    const cabecera = peticion.headers.authorization;
    if (typeof cabecera !== 'string' || !cabecera.startsWith(PREFIJO)) {
      return null;
    }
    const token = cabecera.slice(PREFIJO.length).trim();
    return token.length > 0 ? token : null;
  }

  private permiteClaveTemporal(contexto: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(METADATO_PERMITIR_CLAVE_TEMPORAL, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) === true
    );
  }
}
