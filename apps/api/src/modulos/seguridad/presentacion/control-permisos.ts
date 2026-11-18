import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  UseGuards,
} from '@nestjs/common';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import type { Rol } from '../dominio/rol';
import { Roles } from './decoradores';
import { JwtAuthGuard, type PeticionAutenticada } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

/** Lo que otro módulo recibe del usuario autenticado: sin datos personales (principio VII). */
export interface UsuarioAutenticado {
  readonly usuarioId: string;
  readonly roles: readonly Rol[];
}

/**
 * Protege una operación: exige una sesión válida y al menos uno de los roles indicados
 * (contracts/control-permisos.md).
 */
export const RequiereRoles = (...roles: Rol[]): MethodDecorator & ClassDecorator =>
  applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(...roles));

/** Entrega `{ usuarioId, roles }` del usuario autenticado por `JwtAuthGuard`. */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const sesion = contexto.switchToHttp().getRequest<PeticionAutenticada>().sesionAutenticada;
    if (sesion === undefined) {
      throw ErrorProblema.noAutenticado();
    }
    return { usuarioId: sesion.usuarioId, roles: sesion.roles };
  },
);
