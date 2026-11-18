import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import { ErrorAutenticacion } from '../aplicacion/errores';
import {
  ResolverUsuarioAutenticado,
  type SesionResuelta,
} from '../aplicacion/resolver-usuario-autenticado';
import type { EmisorTokens } from '../dominio/puertos/emisor-tokens';
import { EMISOR_TOKENS } from '../tokens';
import { METADATO_PERMITIR_CLAVE_TEMPORAL } from './decoradores';

/** Sesión que el guard deja en la petición (interna del módulo; sin datos personales). */
export type SesionAutenticada = SesionResuelta;

export interface PeticionAutenticada {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  sesionAutenticada?: SesionAutenticada;
}

const PREFIJO = 'Bearer ';

/**
 * Exige un token de acceso válido de una sesión vigente (401 `no-autenticado`) y resuelve los roles
 * que valen ahora (research.md §R-07). Si el usuario tiene clave temporal, solo deja pasar las
 * operaciones marcadas con `@PermitirConClaveTemporal()` (403 `debe-cambiar-clave`, FR-022).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(EMISOR_TOKENS) private readonly emisor: EmisorTokens,
    private readonly resolver: ResolverUsuarioAutenticado,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionAutenticada>();
    const token = this.extraerToken(peticion);
    const reclamos = token === null ? null : await this.emisor.verificarAcceso(token);
    if (reclamos === null) {
      throw ErrorProblema.noAutenticado();
    }

    let sesion: SesionAutenticada;
    try {
      sesion = await this.resolver.ejecutar(reclamos);
    } catch (error) {
      if (error instanceof ErrorAutenticacion) {
        throw ErrorProblema.noAutenticado();
      }
      throw error;
    }

    if (sesion.debeCambiarClave && !this.permiteClaveTemporal(contexto)) {
      throw ErrorProblema.debeCambiarClave();
    }

    peticion.sesionAutenticada = sesion;
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
