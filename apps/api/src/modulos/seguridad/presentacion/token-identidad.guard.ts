import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ErrorProblema } from '../../../compartido/presentacion/error-problema';
import type { EmisorTokensIdentidad } from '../dominio/puertos/emisor-tokens';
import { EMISOR_TOKENS } from '../tokens';

/** Lo que otro módulo recibe del administrado con identidad confirmada: sin datos personales. */
export interface IdentidadConfirmada {
  readonly verificacionId: string;
}

interface PeticionConIdentidad {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  identidadConfirmada?: IdentidadConfirmada;
}

const PREFIJO = 'Bearer ';

/**
 * Exige un `tokenIdentidad` válido (401 si falta, está alterado, venció o es un token del personal).
 * Deja el id de la verificación en la petición; el uso único lo garantiza Trámites al crear el
 * expediente (research §R-04 de la 004).
 */
@Injectable()
export class TokenIdentidadGuard implements CanActivate {
  constructor(@Inject(EMISOR_TOKENS) private readonly emisor: EmisorTokensIdentidad) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionConIdentidad>();
    const cabecera = peticion.headers.authorization;
    const token =
      typeof cabecera === 'string' && cabecera.startsWith(PREFIJO)
        ? cabecera.slice(PREFIJO.length)
        : null;
    const verificacionId = token === null ? null : await this.emisor.verificarIdentidad(token);
    if (verificacionId === null) {
      throw ErrorProblema.noAutenticado();
    }
    peticion.identidadConfirmada = { verificacionId };
    return true;
  }
}

/** Entrega `{ verificacionId }` del administrado autenticado por `TokenIdentidadGuard`. */
export const IdentidadActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): IdentidadConfirmada => {
    const identidad = contexto
      .switchToHttp()
      .getRequest<PeticionConIdentidad>().identidadConfirmada;
    if (identidad === undefined) {
      throw ErrorProblema.noAutenticado();
    }
    return identidad;
  },
);
