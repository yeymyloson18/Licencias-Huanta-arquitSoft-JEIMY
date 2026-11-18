import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import type { Rol } from '../dominio/rol';
import { METADATO_ROLES } from './decoradores';
import type { PeticionAutenticada } from './jwt-auth.guard';

/**
 * Comprueba que el usuario tenga al menos uno de los roles declarados con `@Roles(...)` (FR-012 a
 * FR-014); si no, 403 `sin-permiso`. Usa los roles que resolvió `JwtAuthGuard`, que corre antes.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const admitidos = this.reflector.getAllAndOverride<readonly Rol[] | undefined>(METADATO_ROLES, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (admitidos === undefined || admitidos.length === 0) {
      return true;
    }

    const sesion = contexto.switchToHttp().getRequest<PeticionAutenticada>().sesionAutenticada;
    if (sesion === undefined) {
      throw ErrorProblema.noAutenticado();
    }
    if (!sesion.roles.some((rol) => admitidos.includes(rol))) {
      throw ErrorProblema.sinPermiso();
    }
    return true;
  }
}
